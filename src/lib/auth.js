import { requireEnv } from "./env.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { protectGeneratedFile } from "./fileProtection.js";

const DEVICE_CODE_ENDPOINT_TEMPLATE =
  "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/devicecode";
const TOKEN_ENDPOINT_TEMPLATE = "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token";

const TOKEN_CACHE = new Map();
const TOKEN_CACHE_PATH = path.join(
  os.homedir(),
  ".copilot-tenant-cost-dashboard",
  "token-cache.json"
);
let CACHE_LOADED = false;

function endpoint(template, tenantId) {
  return template.replace("{tenantId}", tenantId);
}

export function readBaseConfig() {
  return {
    tenantId: requireEnv("TENANT_ID"),
    clientId: requireEnv("CLIENT_ID")
  };
}

function parseScopes(scope) {
  return scope
    .split(" ")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildCacheKey(tenantId, clientId, scope) {
  return `${tenantId}::${clientId}::${scope}`;
}

function loadTokenCacheFromDisk() {
  if (CACHE_LOADED) {
    return;
  }
  CACHE_LOADED = true;

  if (!fs.existsSync(TOKEN_CACHE_PATH)) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, "utf8"));
  } catch {
    return;
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
    return;
  }

  for (const entry of parsed.entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    if (
      typeof entry.key !== "string" ||
      typeof entry.accessToken !== "string" ||
      typeof entry.expiresAtEpoch !== "number"
    ) {
      continue;
    }
    TOKEN_CACHE.set(entry.key, {
      accessToken: entry.accessToken,
      refreshToken: typeof entry.refreshToken === "string" ? entry.refreshToken : undefined,
      expiresAtEpoch: entry.expiresAtEpoch
    });
  }
}

function saveTokenCacheToDisk() {
  const entries = [];
  for (const [key, value] of TOKEN_CACHE.entries()) {
    entries.push({
      key,
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAtEpoch: value.expiresAtEpoch
    });
  }

  fs.mkdirSync(path.dirname(TOKEN_CACHE_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify({ version: 1, entries }, null, 2), "utf8");
  protectGeneratedFile(TOKEN_CACHE_PATH);
}

function parseTokenResponse(json, fallbackRefreshToken) {
  if (!json || typeof json.access_token !== "string") {
    throw new Error("Token endpoint response did not include access_token.");
  }

  const expiresIn = Number(json.expires_in || 3600);
  return {
    accessToken: json.access_token,
    refreshToken:
      typeof json.refresh_token === "string" ? json.refresh_token : fallbackRefreshToken,
    expiresAtEpoch: Math.floor(Date.now() / 1000) + expiresIn
  };
}

function shouldReuseToken(token) {
  if (!token?.expiresAtEpoch) {
    return false;
  }
  const nowEpoch = Math.floor(Date.now() / 1000);
  return token.expiresAtEpoch - nowEpoch > 300;
}

async function startDeviceCodeFlow(tenantId, clientId, scope) {
  const response = await fetch(endpoint(DEVICE_CODE_ENDPOINT_TEMPLATE, tenantId), {
    signal: AbortSignal.timeout(30000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      scope
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Device code start failed (${response.status}): ${bodyText}`);
  }

  const payload = JSON.parse(bodyText);
  if (!payload.device_code) {
    throw new Error("Device code endpoint did not return device_code.");
  }
  return payload;
}

async function pollForToken(tenantId, clientId, deviceCodePayload) {
  const tokenUrl = endpoint(TOKEN_ENDPOINT_TEMPLATE, tenantId);
  const intervalMs = Math.max(5, Number(deviceCodePayload.interval || 5)) * 1000;
  const expiresAt = Date.now() + Number(deviceCodePayload.expires_in || 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const tokenResponse = await fetch(tokenUrl, {
      signal: AbortSignal.timeout(30000),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: deviceCodePayload.device_code
      })
    });

    const text = await tokenResponse.text();
    if (tokenResponse.ok) {
      const json = JSON.parse(text);
      return parseTokenResponse(json);
    }

    let errorBody = null;
    try {
      errorBody = JSON.parse(text);
    } catch {
      throw new Error(`Token polling failed (${tokenResponse.status}): ${text}`);
    }

    if (errorBody.error === "authorization_pending") {
      continue;
    }
    if (errorBody.error === "slow_down") {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }
    throw new Error(`Device code token error: ${errorBody.error} ${errorBody.error_description || ""}`);
  }

  throw new Error("Device code flow timed out before sign-in completed.");
}

async function refreshAccessToken(tenantId, clientId, scope, refreshToken) {
  const tokenUrl = endpoint(TOKEN_ENDPOINT_TEMPLATE, tenantId);
  const response = await fetch(tokenUrl, {
    signal: AbortSignal.timeout(30000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
      scope
    })
  });

  const text = await response.text();
  if (!response.ok) {
    let description = text;
    try {
      const parsed = JSON.parse(text);
      description = `${parsed.error || "refresh_failed"} ${parsed.error_description || ""}`.trim();
    } catch {
      // keep raw response text
    }
    throw new Error(`Refresh token failed: ${description}`);
  }

  const json = JSON.parse(text);
  return parseTokenResponse(json, refreshToken);
}

export async function getDelegatedAccessToken(scope, promptLabel = "Sign in", { interactive = true } = {}) {
  const { tenantId, clientId } = readBaseConfig();
  const normalizedScope = parseScopes(scope).join(" ");
  const cacheKey = buildCacheKey(tenantId, clientId, normalizedScope);
  loadTokenCacheFromDisk();

  const cached = TOKEN_CACHE.get(cacheKey);
  if (shouldReuseToken(cached)) {
    return cached.accessToken;
  }
  if (cached?.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(
        tenantId,
        clientId,
        normalizedScope,
        cached.refreshToken
      );
      TOKEN_CACHE.set(cacheKey, refreshed);
      saveTokenCacheToDisk();
      return refreshed.accessToken;
    } catch {
      TOKEN_CACHE.delete(cacheKey);
      saveTokenCacheToDisk();
    }
  }

  if (!interactive) {
    throw new Error("Cached sign-in unavailable. Run npm run collect in a terminal to sign in again.");
  }

  const deviceCodePayload = await startDeviceCodeFlow(tenantId, clientId, normalizedScope);
  console.log(`\n[AUTH] ${promptLabel}`);
  console.log(`[AUTH] ${deviceCodePayload.message}\n`);

  const token = await pollForToken(tenantId, clientId, deviceCodePayload);
  TOKEN_CACHE.set(cacheKey, token);
  saveTokenCacheToDisk();
  return token.accessToken;
}
