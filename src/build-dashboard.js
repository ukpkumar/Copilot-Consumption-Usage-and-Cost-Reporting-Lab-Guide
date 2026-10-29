import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readJsonFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");
  const dashboardPath = path.join(projectRoot, "dashboard.html");
  const snapshotPath = path.join(projectRoot, "data", "latest.json");
  const outputPath = path.join(projectRoot, "dashboard.built.html");

  const template = fs.readFileSync(dashboardPath, "utf8");
  const snapshot = readJsonFile(snapshotPath);
  const serialized = JSON.stringify(snapshot, null, 2).replace(/<\/script/gi, "<\\/script");

  const marker = /<script id="embeddedSnapshot" type="application\/json"><\/script>/;
  if (!marker.test(template)) {
    throw new Error("dashboard.html is missing embeddedSnapshot marker.");
  }

  const built = template.replace(
    marker,
    `<script id="embeddedSnapshot" type="application/json">\n${serialized}\n</script>`
  );
  fs.writeFileSync(outputPath, built, "utf8");
  console.log(`Built dashboard: ${outputPath}`);
}

main();
