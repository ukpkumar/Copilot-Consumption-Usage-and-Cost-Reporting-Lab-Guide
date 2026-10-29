import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function writeOutput(filePath, payload) {
  const fullPath = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf8");
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

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");

  // Support running from outside the project root by always loading project .env as fallback.
  loadEnvFile();
  loadEnvFile(path.join(projectRoot, ".env"));
  requireEnv("TENANT_ID");
  requireEnv("CLIENT_ID");

  const userIds = parseUserIds();
  const outputPath = process.env.OUTPUT_PATH || ".\\data\\latest.json";

  const graphToken = await getDelegatedAccessToken(
    "https://graph.microsoft.com/.default offline_access openid profile",
    "Sign in for Microsoft Graph (Copilot APIs)"
  );
  const [graphCost, graphReports, agent365AdminCatalog] = await Promise.all([
    collectGraphCopilotCost(graphToken, userIds),
    collectGraphCopilotReports(graphToken),
    collectAgent365AdminCatalog(graphToken)
  ]);

  let copilotStudioDataverse;
  if (hasUsableDataverseUrl(process.env.DATAVERSE_URL)) {
    try {
      const dataverseBase = new URL(process.env.DATAVERSE_URL).origin;
      const dataverseToken = await getDelegatedAccessToken(
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
      const armToken = await getDelegatedAccessToken(
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

  const fullOutputPath = writeOutput(outputPath, payload);
  console.log(`Data snapshot saved to: ${fullOutputPath}`);
}

main().catch((error) => {
  console.error("Collector failed:", error.message);
  process.exitCode = 1;
});
