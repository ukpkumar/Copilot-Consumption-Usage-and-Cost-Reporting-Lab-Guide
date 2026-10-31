import test from "node:test";
import assert from "node:assert/strict";
import { collectGraphCopilotCost } from "../src/collectors/graphCopilotCost.js";
import { collectGraphCopilotReports } from "../src/collectors/graphCopilotReports.js";
import { listAll } from "../src/lib/http.js";

const json = (data) => new Response(JSON.stringify(data));

test("Graph cost attempts independent policy and user endpoints despite denials", async (t) => {
  const requests = [];
  const user = "11111111-1111-4111-8111-111111111111";
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    if (url.endsWith("/spendingPolicies")) return json({ value: [{ id: "policy-1" }, { id: "policy-2" }] });
    if (url.endsWith("/recipients")) return json({ value: [{ email: "fixture@example.test" }] });
    if (url.endsWith("/serviceBalances")) return json({ value: [{ remainingQuantity: 10 }] });
    if (url.includes("policy-2")) return json({ value: [] });
    return new Response("Denied", { status: 403 });
  });
  const data = await collectGraphCopilotCost("fixture-token", [user]);
  assert.equal(data.ok, false);
  assert.equal(data.tenantCreditBalance, null);
  assert.equal(data.policies.length, 2);
  assert.equal(data.policies[0].recipients.length, 1);
  assert.equal(data.policies[0].serviceSettings.length, 0);
  assert.equal(data.userDiagnostics[0].serviceBalances[0].remainingQuantity, 10);
  assert.match(data.userDiagnostics[0].error, /403/);
  for (const suffix of ["getTenantCreditBalance", "spendingPolicies", "policy-1/serviceSettings", "policy-1/emailThresholdSettings", "policy-1/emailThresholdSettings/recipients", "policy-2/serviceSettings", `userBalances/${user}`, `userBalances/${user}/serviceBalances`]) {
    assert.ok(requests.some((url) => url.endsWith(suffix)), suffix);
  }
});

test("all JSON report pages are collected and fallback behavior is preserved", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("/usage-page-2")) return json({ value: [{ id: "second" }], "@odata.nextLink": "https://graph.microsoft.com/beta/copilot/reports/usage-page-3" });
    if (url.endsWith("/usage-page-3")) return json({ value: [{ id: "third" }] });
    if (url.includes("UsageUserDetail")) return json({ value: [{ id: "first" }], "@odata.nextLink": "https://graph.microsoft.com/beta/copilot/reports/usage-page-2" });
    if (url.includes("UserCountSummary") && url.includes("/beta/")) return new Response("Unavailable", { status: 404 });
    return json({ value: [{ count: 3 }] });
  });
  const reports = await collectGraphCopilotReports("fixture-token");
  assert.deepEqual(reports.usageDetail.data.value.map((row) => row.id), ["first", "second", "third"]);
  assert.equal(reports.usageDetail.data["@odata.nextLink"], undefined);
  assert.equal(reports.userCountSummary.ok, true);
  assert.equal(reports.userCountSummary.source, "v1-json");
  assert.equal(reports.userCountTrend.ok, true);
});

test("pagination cannot forward tokens to a different host or loop indefinitely", async (t) => {
  const start = "https://graph.microsoft.com/beta/items";
  let next = "https://untrusted.example/items";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return json({ value: [], "@odata.nextLink": next }); });
  await assert.rejects(listAll(start, "fixture-token"), /pagination link/);
  assert.equal(calls, 1);
  next = start;
  await assert.rejects(listAll(start, "fixture-token"), /pagination link/);
  assert.equal(calls, 2);
});
