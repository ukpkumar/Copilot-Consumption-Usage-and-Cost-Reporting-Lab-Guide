import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { protectGeneratedFile } from "../src/lib/fileProtection.js";

test("generated Windows files retain stricter protection across replacement", { skip: process.platform !== "win32" }, (t) => {
  let existing = "[ZoneTransfer]\r\nZoneId=4\r\n";
  let written;
  t.mock.method(fs, "readFileSync", (file) => {
    assert.equal(file, "snapshot.json:Zone.Identifier");
    if (existing === null) throw Object.assign(new Error("Missing stream"), { code: "ENOENT" });
    return existing;
  });
  t.mock.method(fs, "writeFileSync", (file, data) => {
    assert.equal(file, "snapshot.tmp:Zone.Identifier");
    written = data;
  });
  protectGeneratedFile("snapshot.tmp", "snapshot.json");
  assert.match(written, /ZoneId=4/);
  existing = null;
  protectGeneratedFile("snapshot.tmp", "snapshot.json");
  assert.match(written, /ZoneId=3/);
  t.mock.method(fs, "readFileSync", () => { throw Object.assign(new Error("Denied"), { code: "EACCES" }); });
  assert.throws(() => protectGeneratedFile("snapshot.tmp", "snapshot.json"), /Denied/);
});
