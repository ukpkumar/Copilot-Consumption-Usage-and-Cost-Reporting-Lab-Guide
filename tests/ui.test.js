import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { once } from "node:events";
import { createDashboardServer } from "../src/server.js";

function documentFixture() {
  const nodes = new Map();
  const document = {
    documentElement: { setAttribute() {} },
    createElement: () => ({ value: "", textContent: "" }),
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, {
        hidden: id === "liveControls", textContent: "", innerHTML: "", value: "", disabled: false,
        listeners: {}, children: [],
        addEventListener(event, listener) { this.listeners[event] = listener; },
        appendChild(child) { this.children.push(child); if (!this.value) this.value = child.value; }
      });
      return nodes.get(id);
    }
  };
  return document;
}

test("page connects, renders a snapshot and operates Graph and collect controls", async (t) => {
  let collections = 0;
  const { server } = createDashboardServer({
    collect: async () => { collections++; },
    readSnapshot: () => ({ generatedAt: "UI fixture", tenantId: "fixture-tenant", queriedUsers: [], sources: {} }),
    tokenProvider: async () => "fixture-token",
    fetchImpl: async () => new Response(JSON.stringify({ displayName: "Fixture user" }))
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const document = documentFixture();
  const location = { protocol: "http:", hostname: "127.0.0.1", search: "" };
  const context = vm.createContext({ document, location, window: { location, matchMedia: () => ({ matches: false }) },
    URLSearchParams, AbortSignal, console, setTimeout: () => {},
    fetch: (url, options = {}) => fetch(origin + url, { ...options,
      headers: { ...options.headers, ...(options.method === "POST" ? { Origin: origin } : {}) } })
  });
  const html = fs.readFileSync("dashboard.html", "utf8");
  for (const match of html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)) {
    new vm.Script(match[1]).runInContext(context);
  }
  for (let attempt = 0; attempt < 100 && document.getElementById("kpiGeneratedAt").textContent !== "UI fixture"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(document.getElementById("liveControls").hidden, false);
  assert.equal(document.getElementById("kpiGeneratedAt").textContent, "UI fixture");
  assert.equal(document.getElementById("kpiTenantId").textContent, "fixture-tenant");
  assert.equal(document.getElementById("graphTest").children.length, 7);
  const graphButton = document.getElementById("graphTestBtn");
  await graphButton.listeners.click();
  assert.match(document.getElementById("graphResult").textContent, /Fixture user/);
  assert.doesNotMatch(document.getElementById("graphResult").textContent, /fixture-token/);
  assert.equal(graphButton.disabled, false);
  await document.getElementById("collectBtn").listeners.click();
  assert.equal(collections, 1);
  assert.match(document.getElementById("collectionStatus").textContent, /Last saved:/);
  await document.getElementById("clearBtn").listeners.click();
  assert.equal(document.getElementById("kpiGeneratedAt").textContent, "-");
  await document.getElementById("loadSampleBtn").listeners.click();
  assert.equal(document.getElementById("kpiGeneratedAt").textContent, "UI fixture");
});
