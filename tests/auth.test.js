import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate cache I/O in memory; never read or overwrite the developer's real tokens.
test("delegated cache reuse, refresh and noninteractive reauthentication", async (t) => {
  const home = path.resolve("tests", "in-memory-auth-home");
  const cachePath = path.join(home, ".copilot-tenant-cost-dashboard", "token-cache.json");
  const previousTenant = process.env.TENANT_ID;
  const previousClient = process.env.CLIENT_ID;
  process.env.TENANT_ID = "fixture-tenant";
  process.env.CLIENT_ID = "fixture-client";
  t.after(() => {
    for (const [key, value] of [["TENANT_ID", previousTenant], ["CLIENT_ID", previousClient]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  t.mock.method(os, "homedir", () => home);
  t.mock.method(fs, "existsSync", (file) => { assert.equal(file, cachePath); return true; });
  const cache = { entries: [
    { key: "fixture-tenant::fixture-client::reusable", accessToken: "cached-fixture", expiresAtEpoch: Date.now() / 1000 + 3600 },
    { key: "fixture-tenant::fixture-client::refreshable", accessToken: "expired-fixture", refreshToken: "refresh-fixture", expiresAtEpoch: 1 },
    { key: "fixture-tenant::fixture-client::revoked", accessToken: "expired-fixture", refreshToken: "revoked-fixture", expiresAtEpoch: 1 }
  ] };
  const readFile = fs.readFileSync.bind(fs);
  t.mock.method(fs, "readFileSync", (file, ...args) => file === cachePath ? JSON.stringify(cache) : readFile(file, ...args));
  t.mock.method(fs, "mkdirSync", (dir) => assert.equal(dir, path.dirname(cachePath)));
  let saved;
  t.mock.method(fs, "writeFileSync", (file, text) => {
    if (file === `${cachePath}:Zone.Identifier`) { assert.match(text, /ZoneId=3/); return; }
    assert.equal(file, cachePath); saved = JSON.parse(text);
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(url);
    assert.equal(options.body.get("grant_type"), "refresh_token");
    if (options.body.get("refresh_token") === "revoked-fixture") {
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    }
    return new Response(JSON.stringify({ access_token: "renewed-fixture", refresh_token: "new-refresh-fixture", expires_in: 3600 }));
  });
  const { getDelegatedAccessToken } = await import("../src/lib/auth.js");
  assert.equal(await getDelegatedAccessToken("reusable", "Test", { interactive: false }), "cached-fixture");
  assert.equal(calls.length, 0);
  assert.equal(await getDelegatedAccessToken("refreshable", "Test", { interactive: false }), "renewed-fixture");
  assert.equal(calls.length, 1);
  assert.equal(saved.entries.find((item) => item.key.endsWith("refreshable")).refreshToken, "new-refresh-fixture");
  await assert.rejects(getDelegatedAccessToken("missing", "Test", { interactive: false }), /npm run collect/);
  assert.equal(calls.length, 1);
  await assert.rejects(getDelegatedAccessToken("revoked", "Test", { interactive: false }), /npm run collect/);
  assert.equal(calls.length, 2);
  assert.ok(!saved.entries.some((item) => item.key.endsWith("revoked")));
  assert.ok(calls.every((url) => url.endsWith("/token")));
});
