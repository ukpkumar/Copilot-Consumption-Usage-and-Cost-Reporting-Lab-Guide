import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSnapshot } from "./collect-all.js";
import { getDelegatedAccessToken } from "./lib/auth.js";
import { loadEnvFile } from "./lib/env.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graphScope = "https://graph.microsoft.com/.default offline_access openid profile";
export const graphTests = Object.freeze({
  profile: { label: "Signed-in user (User.Read)", path: "/v1.0/me?$select=id,displayName,userPrincipalName" },
  balance: { label: "Tenant credit balance", path: "/beta/copilot/costManagement/getTenantCreditBalance" },
  policies: { label: "Spending policies", path: "/beta/copilot/costManagement/spendingPolicies" },
  usage: { label: "Copilot usage detail (D28)", path: "/beta/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='D28',version='v2')" },
  summary: { label: "Copilot user count summary (D28)", path: "/beta/copilot/reports/getMicrosoft365CopilotUserCountSummary(period='D28',version='v2')" },
  trend: { label: "Copilot user count trend (D28)", path: "/beta/copilot/reports/getMicrosoft365CopilotUserCountTrend(period='D28',version='v2')" },
  catalog: { label: "Copilot admin package catalog", path: "/beta/copilot/admin/catalog/packages" }
});

export function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      /token|secret|authorization|password|@odata\.(nextLink|deltaLink)|^nextLink$/i.test(key)
        ? "[redacted]" : sanitize(item)]));
  }
  if (typeof value === "string") {
    return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
      .replace(/https?:\/\/[^\s"<>]+[?][^\s"<>]*/g, "[URL query redacted]");
  }
  return value;
}

export function createCollectionRunner(collect, intervalMs) {
  if (!Number.isFinite(intervalMs) || intervalMs < 60000 || intervalMs > 2147483647) {
    throw new Error("Collection interval must be between 1 minute and 35791 minutes.");
  }
  const status = { running: false, lastAttemptAt: null, lastSuccessAt: null, error: null, intervalMinutes: intervalMs / 60000 };
  let pending;
  let timer;
  function run() {
    if (pending) return pending;
    status.running = true;
    status.lastAttemptAt = new Date().toISOString();
    status.error = null;
    pending = Promise.resolve().then(collect).then(() => {
      status.lastSuccessAt = new Date().toISOString();
    }).catch(() => {
      status.error = "Collection failed. Run npm run collect in a terminal to check permissions or renew sign-in. The previous snapshot is retained.";
    }).finally(() => {
      status.running = false;
      pending = undefined;
    });
    return pending;
  }
  return {
    status, run,
    start() { if (!timer) { void run(); timer = setInterval(run, intervalMs); timer.unref(); } },
    stop() { clearInterval(timer); timer = undefined; }
  };
}

export function createDashboardServer({
  collect = () => collectSnapshot({ interactive: false, outputFile: path.resolve(projectRoot, process.env.OUTPUT_PATH || path.join("data", "latest.json")) }),
  tokenProvider = getDelegatedAccessToken,
  fetchImpl = fetch,
  readSnapshot = () => JSON.parse(fs.readFileSync(path.resolve(projectRoot, process.env.OUTPUT_PATH || path.join("data", "latest.json")), "utf8")),
  intervalMs = 60 * 60000
} = {}) {
  const runner = createCollectionRunner(collect, intervalMs);
  let testing = false;
  const server = http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (status, data) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(sanitize(data))); };
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers["sec-fetch-site"] === "cross-site") {
      json(403, { error: "Only same-origin local requests are allowed." }); return;
    }
    const route = req.url;
    try {
      if (req.method === "GET" && route === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(path.join(projectRoot, "dashboard.html"))); return;
      }
      if (req.method === "GET" && route === "/api/status") { json(200, runner.status); return; }
      if (req.method === "GET" && route === "/api/snapshot") {
        try { json(200, readSnapshot()); } catch { json(404, { error: "No readable snapshot yet. Run collection first." }); }
        return;
      }
      if (req.method === "GET" && route === "/api/graph/tests") { json(200, graphTests); return; }
      if (req.method === "POST") {
        if (req.headers["x-dashboard-request"] !== "1" || req.headers.origin !== origin) {
          json(403, { error: "Missing same-origin request protection." }); return;
        }
        if (route === "/api/collect") {
          const alreadyRunning = runner.status.running;
          void runner.run();
          json(202, { ...runner.status, alreadyRunning }); return;
        }
        if (route?.startsWith("/api/graph/test/")) {
          const id = route.slice("/api/graph/test/".length);
          if (!Object.hasOwn(graphTests, id)) { json(400, { error: "Choose an approved Graph test." }); return; }
          if (testing) { json(409, { error: "A Graph test is already running." }); return; }
          testing = true;
          try {
            const token = await tokenProvider(graphScope, "Microsoft Graph", { interactive: false });
            const endpoint = graphTests[id].path;
            const started = Date.now();
            const upstream = await fetchImpl(`https://graph.microsoft.com${endpoint}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
              redirect: "manual", signal: AbortSignal.timeout(30000)
            });
            // Do not expose signed report-download redirects or upstream error bodies.
            let data = null;
            if (upstream.ok) {
              const reader = upstream.body?.getReader();
              const chunks = [];
              let size = 0;
              if (reader) {
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.length;
                    if (size > 1024 * 1024) { await reader.cancel(); throw new Error("Response too large"); }
                    chunks.push(Buffer.from(value));
                  }
                } finally { reader.releaseLock(); }
              }
              const text = Buffer.concat(chunks).toString("utf8").split(token).join("[redacted]");
              try { data = JSON.parse(text); } catch { data = text; }
            } else {
              await upstream.body?.cancel();
            }
            json(200, { endpoint, status: upstream.status, ok: upstream.ok, durationMs: Date.now() - started,
              message: upstream.ok ? "Request succeeded." : "Graph returned an error or redirect. Check endpoint availability, delegated permissions, admin consent, and tenant licensing.", data });
          } catch {
            json(502, { error: "Graph test failed. Check connectivity or run npm run collect in a terminal to renew sign-in." });
          } finally { testing = false; }
          return;
        }
      }
      json(404, { error: "Not found." });
    } catch {
      if (!res.headersSent) json(500, { error: "Local dashboard request failed." });
      else res.end();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on("close", () => runner.stop());
  return { server, runner };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnvFile(path.join(projectRoot, ".env"));
  const intervalMs = Number(process.env.COLLECTION_INTERVAL_MINUTES || 60) * 60000;
  const { server, runner } = createDashboardServer({ intervalMs });
  server.listen(0, "127.0.0.1", () => {
    console.log(`Dashboard: http://127.0.0.1:${server.address().port}`);
    console.log("Uses cached delegated sign-in. If needed, run npm run collect in a terminal first.");
    runner.start();
  });
  server.on("error", () => { console.error("Dashboard server could not start."); process.exitCode = 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => { runner.stop(); server.close(); });
  }
}
