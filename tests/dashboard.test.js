import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { once } from "node:events";
import http from "node:http";
import { createDashboardServer, createCollectionRunner, sanitize, graphTests } from "../src/server.js";
import { collectSnapshot, writeOutput } from "../src/collect-all.js";

async function localServer(t, options = {}) {
  const instance = createDashboardServer({ collect: async () => {}, readSnapshot: () => ({ generatedAt: "fixture", sources: {} }), ...options });
  instance.server.listen(0, "127.0.0.1");
  await once(instance.server, "listening");
  t.after(() => new Promise((resolve) => { instance.runner.stop(); instance.server.close(resolve); instance.server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${instance.server.address().port}`;
  return { ...instance, origin, request: (route, init = {}) => fetch(origin + route, init),
    post: (route) => fetch(origin + route, { method: "POST", headers: { Origin: origin, "X-Dashboard-Request": "1" } }) };
}

test("local server serves only dashboard and sanitized snapshot", async (t) => {
  const app = await localServer(t, { readSnapshot: () => ({ generatedAt: "fixture", access_token: "private", nested: { clientSecret: "private", text: "Bearer private", rows: [1, 2] } }) });
  const home = await app.request("/");
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Graph API test/);
  assert.match(home.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const response = await app.request("/api/snapshot");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.access_token, "[redacted]");
  assert.equal(body.nested.clientSecret, "[redacted]");
  assert.deepEqual(body.nested.rows, [1, 2]);
  for (const route of ["/.env", "/src/lib/auth.js", "/data/latest.json", "/token-cache.json", "/api/snapshot?path=.env"]) {
    assert.equal((await app.request(route)).status, 404);
  }
});

test("rejects cross-origin, DNS rebinding, and unprotected mutations", async (t) => {
  let calls = 0;
  const app = await localServer(t, { collect: async () => { calls++; } });
  assert.equal((await app.request("/api/status", { headers: { Origin: "https://example.com" } })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    http.get(app.origin + "/api/status", { headers: { Host: "evil.example" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on("error", reject);
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await app.request("/api/status", { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal((await app.request("/api/collect", { method: "POST" })).status, 403);
  assert.equal((await app.request("/api/collect", { method: "POST", headers: { Origin: app.origin } })).status, 403);
  assert.equal(calls, 0);
});

test("Graph tests use only allowlisted GET URLs and server-side delegated tokens", async (t) => {
  const requests = [];
  const app = await localServer(t, {
    tokenProvider: async (scope, label, options) => { assert.equal(options.interactive, false); assert.match(scope, /graph.microsoft.com/); return "fake-private-token"; },
    fetchImpl: async (url, options) => {
      requests.push(url);
      assert.equal(options.headers.Authorization, "Bearer fake-private-token");
      assert.equal(options.redirect, "manual");
      assert.equal(options.method, undefined);
      return new Response(JSON.stringify({ displayName: "Test User", access_token: "fake-private-token", text: "fake-private-token" }), { headers: { "Content-Type": "application/json" } });
    }
  });
  const choices = await (await app.request("/api/graph/tests")).json();
  assert.equal(Object.keys(choices).length, Object.keys(graphTests).length);
  const response = await app.post("/api/graph/test/profile");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 200);
  assert.equal(body.data.displayName, "Test User");
  assert.doesNotMatch(JSON.stringify(body), /fake-private-token/);
  assert.equal(requests[0], "https://graph.microsoft.com" + graphTests.profile.path);
  for (const id of ["https:%2F%2Fevil.example", "__proto__", "profile?url=https://evil.example", "block"]) {
    assert.equal((await app.post("/api/graph/test/" + id)).status, 400);
  }
  assert.equal(requests.length, 1);
});

test("Graph failures, redirects and oversized responses cannot leak upstream content", async (t) => {
  let mode = "error";
  const app = await localServer(t, {
    tokenProvider: async () => "fake-token",
    fetchImpl: async () => mode === "large" ? new Response("x".repeat(1024 * 1024 + 1)) : new Response("private upstream detail", { status: mode === "error" ? 403 : 302, headers: { Location: "https://example.com?secret=private" } })
  });
  for (const value of ["error", "redirect"]) {
    mode = value;
    const body = await (await app.post("/api/graph/test/balance")).json();
    assert.equal(body.ok, false);
    assert.equal(body.status, value === "error" ? 403 : 302);
    assert.doesNotMatch(JSON.stringify(body), /private|example.com/);
  }
  mode = "large";
  assert.equal((await app.post("/api/graph/test/balance")).status, 502);
});

test("Graph sign-in failure is actionable without returning tokens or exception details", async (t) => {
  const app = await localServer(t, { tokenProvider: async () => { throw new Error("client_secret=private"); } });
  const response = await app.post("/api/graph/test/profile");
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /npm run collect/);
  assert.doesNotMatch(body, /private/);
});

test("collection is single-flight, reports failures and recovers", async () => {
  let release;
  let calls = 0;
  let fail = false;
  const runner = createCollectionRunner(() => {
    calls++;
    if (fail) throw new Error("private");
    return new Promise((resolve) => { release = resolve; });
  }, 60000);
  assert.throws(() => createCollectionRunner(() => {}, 0));
  assert.throws(() => createCollectionRunner(() => {}, Infinity));
  const first = runner.run();
  assert.equal(runner.status.running, true);
  assert.equal(runner.run(), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  await first;
  const success = runner.status.lastSuccessAt;
  assert.ok(success);
  fail = true;
  await runner.run();
  assert.equal(runner.status.lastSuccessAt, success);
  assert.match(runner.status.error, /previous snapshot is retained/);
  assert.doesNotMatch(runner.status.error, /private/);
  assert.equal(runner.status.running, false);
  fail = false;
  const recovery = runner.run();
  await Promise.resolve();
  release();
  await recovery;
  assert.equal(runner.status.error, null);
});

test("scheduler starts collection and runs again on its interval", async (t) => {
  const timers = t.mock.timers;
  timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  const runner = createCollectionRunner(async () => { calls++; }, 60000);
  t.after(() => runner.stop());
  runner.start();
  await runner.run();
  assert.equal(calls, 1);
  timers.tick(60000);
  await runner.run();
  assert.equal(calls, 2);
  runner.stop();
  timers.tick(60000);
  assert.equal(calls, 2);
});

test("collection API responds asynchronously and missing snapshots are explicit", async (t) => {
  let release;
  const app = await localServer(t, { collect: () => new Promise((resolve) => { release = resolve; }), readSnapshot: () => { throw new Error("missing"); } });
  assert.equal((await app.request("/api/snapshot")).status, 404);
  assert.equal((await app.post("/api/collect")).status, 202);
  const again = await (await app.post("/api/collect")).json();
  assert.equal(again.alreadyRunning, true);
  assert.equal(again.running, true);
  const pending = app.runner.run();
  release();
  await pending;
  assert.equal((await (await app.request("/api/status")).json()).running, false);
});

test("collector preserves successful sources when Graph cost fails and honors noninteractive mode", async (t) => {
  const keys = ["TENANT_ID", "CLIENT_ID", "AZURE_SUBSCRIPTION_ID", "DATAVERSE_URL", "USER_IDS", "AGENT365_USAGE_URL", "COPILOT_STUDIO_USAGE_EXPORT_PATH", "COPILOT_ADMIN_REQUEST_FILTER"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
  for (const key of keys) process.env[key] = "";
  process.env.TENANT_ID = "test-tenant";
  process.env.CLIENT_ID = "test-client";
  process.env.AZURE_SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000000";
  process.env.COPILOT_STUDIO_USAGE_EXPORT_PATH = "nonexistent-fixture.json";
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.includes("getTenantCreditBalance")) return new Response("Denied", { status: 403 });
    return new Response(JSON.stringify({ value: [] }));
  });
  const snapshot = await collectSnapshot({ persist: false, interactive: false, tokenProvider: async (scope, label, options) => {
    assert.equal(options.interactive, false);
    return "fixture-token";
  } });
  assert.equal(snapshot.tenantId, "test-tenant");
  assert.equal(snapshot.sources.graphCopilotCost.ok, false);
  assert.equal(snapshot.sources.graphCopilotReports.usageDetail.ok, true);
  assert.equal(snapshot.sources.agent365AdminCatalog.ok, true);
  assert.equal(snapshot.sources.azureCostManagement.skipped, true);
  assert.equal(snapshot.sources.copilotStudioDataverse.skipped, true);
});

test("snapshot replacement is atomic and failed saves retain the previous snapshot", (t) => {
  const target = path.resolve("tests", "in-memory-snapshot.json");
  const files = new Map([[target, "previous snapshot"]]);
  let fail = true;
  t.mock.method(fs, "mkdirSync", () => {});
  t.mock.method(fs, "writeFileSync", (file, data, options) => {
    if (file.endsWith(":Zone.Identifier")) { assert.match(data, /ZoneId=3/); return; }
    assert.notEqual(file, target);
    assert.equal(options.flag, "wx");
    files.set(file, data);
  });
  t.mock.method(fs, "renameSync", (from, to) => {
    assert.equal(to, target);
    if (fail) throw new Error("Simulated save failure");
    files.set(to, files.get(from));
    files.delete(from);
  });
  t.mock.method(fs, "existsSync", (file) => files.has(file));
  t.mock.method(fs, "unlinkSync", (file) => files.delete(file));
  assert.throws(() => writeOutput(target, { generatedAt: "new snapshot" }), /Simulated/);
  assert.equal(files.get(target), "previous snapshot");
  assert.equal(files.size, 1);
  fail = false;
  assert.equal(writeOutput(target, { generatedAt: "new snapshot" }), target);
  assert.equal(JSON.parse(files.get(target)).generatedAt, "new snapshot");
  assert.equal(files.size, 1);
});

test("sanitization strips token-shaped strings and signed links without changing numeric data", () => {
  const result = sanitize({ amount: 42, unit: "USD", "@odata.nextLink": "https://example.com?sig=private", nested: ["Bearer private", "eyJhbGciOiJIUzI1NiJ9.abc.def", "https://example.com?sig=private"] });
  assert.equal(result.amount, 42);
  assert.equal(result.unit, "USD");
  assert.doesNotMatch(JSON.stringify(result), /private|eyJ/);
});

test("dashboard inline scripts remain syntactically valid and preserve standalone import", () => {
  const html = fs.readFileSync(path.resolve("dashboard.html"), "utf8");
  for (const match of html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)) {
    new vm.Script(match[1]);
  }
  assert.match(html, /loadEmbeddedSnapshot/);
  assert.match(html, /fileInput.addEventListener/);
  assert.match(html, /location.protocol !== "http:"/);
});
