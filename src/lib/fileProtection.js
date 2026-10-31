import fs from "node:fs";

export function protectGeneratedFile(filePath, inheritFrom = filePath) {
  if (process.platform !== "win32") return;
  let zone = 3;
  try {
    const existing = fs.readFileSync(`${inheritFrom}:Zone.Identifier`, "utf8");
    if (/^ZoneId=4\s*$/m.test(existing)) zone = 4;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  fs.writeFileSync(`${filePath}:Zone.Identifier`, `[ZoneTransfer]\r\nZoneId=${zone}\r\n`, "utf8");
}
