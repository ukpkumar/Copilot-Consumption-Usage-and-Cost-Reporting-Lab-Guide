import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { protectGeneratedFile } from "./lib/fileProtection.js";
import { getDelegatedAccessToken } from "./lib/auth.js";
import { loadEnvFile, requireEnv } from "./lib/env.js";
import { collectAgent365AdminCatalog } from "./collectors/agent365AdminCatalog.js";
import { collectAgentUsage } from "./collectors/agentUsage.js";
import { collectAzureCostManagement } from "./collectors/azureCostManagement.js";
import { collectCopilotStudioDataverse } from "./collectors/copilotStudioDataverse.js";
import { collectGraphCopilotCost } from "./collectors/graphCopilotCost.js";
import { collectGraphCopilotReports } from "./collectors/graphCopilotReports.js";

function parseUserIds() {
  const raw = process.env.USER_IDS || "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function writeOutput(filePath, payload) {
  const fullPath = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(fullPath);
  const serialized = JSON.stringify(payload, null, 2);
  fs.mkdirSync(dir, { recursive: true });
  const temporaryPath = `${fullPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    protectGeneratedFile(temporaryPath, fullPath);
    fs.renameSync(temporaryPath, fullPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return fullPath;
}

function hasUsableSubscriptionId(value) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "00000000-0000-0000-0000-000000000000";
}

function hasUsableDataverseUrl(value) {
  return Boolean(value && String(value).trim());
}

export async function collectSnapshot({ interactive = true, persist = true, outputFile, tokenProvider = getDelegatedAccessToken } = {}) {
  const getToken = (scope, label) => tokenProvider(scope, label, { interactive });
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");

  // Support running from outside the project root by always loading project .env as fallback.
  loadEnvFile();
  loadEnvFile(path.join(projectRoot, ".env"));
  requireEnv("TENANT_ID");
  requireEnv("CLIENT_ID");

  const userIds = parseUserIds();
  const outputPath = outputFile || process.env.OUTPUT_PATH || ".\\data\\latest.json";

  const graphToken = await getToken(
    "https://graph.microsoft.com/.default offline_access openid profile",
    "Sign in for Microsoft Graph (Copilot APIs)"
  );
  const results = await Promise.allSettled([
    collectGraphCopilotCost(graphToken, userIds),
    collectGraphCopilotReports(graphToken),
    collectAgent365AdminCatalog(graphToken)
  ]);
  const [graphCost, graphReports, agent365AdminCatalog] = results.map((result) =>
    result.status === "fulfilled" ? result.value : { ok: false, error: result.reason.message }
  );

  let copilotStudioDataverse;
  if (hasUsableDataverseUrl(process.env.DATAVERSE_URL)) {
    try {
      const dataverseBase = new URL(process.env.DATAVERSE_URL).origin;
      const dataverseToken = await getToken(
        `${dataverseBase}/.default offline_access openid profile`,
        "Sign in for Dataverse (Copilot Studio analytics)"
      );
      copilotStudioDataverse = await collectCopilotStudioDataverse(
        dataverseToken,
        process.env.DATAVERSE_URL
      );
    } catch (error) {
      copilotStudioDataverse = { ok: false, error: error.message };
    }
  } else {
    copilotStudioDataverse = {
      ok: false,
      skipped: true,
      reason: "DATAVERSE_URL is not configured."
    };
  }

  const agentUsage = await collectAgentUsage(graphToken, projectRoot, copilotStudioDataverse);

  let azureCost;
  if (hasUsableSubscriptionId(process.env.AZURE_SUBSCRIPTION_ID)) {
    try {
      const armToken = await getToken(
        "https://management.azure.com/user_impersonation offline_access openid profile",
        "Sign in for Azure Cost Management"
      );
      azureCost = await collectAzureCostManagement(armToken);
    } catch (error) {
      azureCost = { ok: false, error: error.message };
    }
  } else {
    azureCost = {
      ok: false,
      skipped: true,
      reason:
        "AZURE_SUBSCRIPTION_ID is missing or placeholder value. Graph Copilot Cost Management data was still collected."
    };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    tenantId: process.env.TENANT_ID,
    appClientId: process.env.CLIENT_ID,
    queriedUsers: userIds,
    sources: {
      graphCopilotCost: graphCost,
      graphCopilotReports: graphReports,
      agentUsage,
      agent365AdminCatalog,
      copilotStudioDataverse,
      azureCostManagement: azureCost
    }
  };

  if (persist) {
    const fullOutputPath = writeOutput(outputPath, payload);
    console.log(`Data snapshot saved to: ${fullOutputPath}`);
  }
  return payload;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  collectSnapshot().catch((error) => {
    console.error("Collector failed:", error.message);
    process.exitCode = 1;
  });
}
