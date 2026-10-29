import { listAll, requestJson } from "../lib/http.js";

const GRAPH_BETA_ROOT = "https://graph.microsoft.com/beta/copilot/costManagement";
const GRAPH_V1_ROOT = "https://graph.microsoft.com/v1.0";

function isGuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function resolveUserBalanceKey(accessToken, userIdOrUpn) {
  const candidate = (userIdOrUpn || "").trim();
  if (!candidate) {
    throw new Error("User identifier is empty.");
  }
  if (isGuid(candidate)) {
    return { balanceKey: candidate, resolvedFrom: "guid" };
  }

  // userBalances key currently resolves by user object ID; UPN/mail can 404 even for valid users.
  const user = await requestJson(
    `${GRAPH_V1_ROOT}/users/${encodeURIComponent(candidate)}?$select=id,userPrincipalName,mail`,
    accessToken
  );
  if (!user?.id) {
    throw new Error(`Could not resolve user object ID for ${candidate}.`);
  }
  return {
    balanceKey: user.id,
    resolvedFrom: "upn-or-mail",
    resolvedUserPrincipalName: user.userPrincipalName || null
  };
}

async function readAlertRecipients(accessToken, policyId) {
  const url = `${GRAPH_BETA_ROOT}/spendingPolicies/${encodeURIComponent(policyId)}/emailThresholdSettings/recipients`;
  return listAll(url, accessToken);
}

async function readUserDiagnostic(accessToken, userId) {
  const resolved = await resolveUserBalanceKey(accessToken, userId);
  const userPath = encodeURIComponent(resolved.balanceKey);
  const balance = await requestJson(
    `${GRAPH_BETA_ROOT}/userBalances/${userPath}`,
    accessToken
  );
  const serviceBalances = await listAll(
    `${GRAPH_BETA_ROOT}/userBalances/${userPath}/serviceBalances`,
    accessToken
  );
  return {
    userId,
    resolvedUserId: resolved.balanceKey,
    resolvedFrom: resolved.resolvedFrom,
    resolvedUserPrincipalName: resolved.resolvedUserPrincipalName,
    balance,
    serviceBalances
  };
}

export async function collectGraphCopilotCost(accessToken, userIds = []) {
  const tenantCreditBalance = await requestJson(
    `${GRAPH_BETA_ROOT}/getTenantCreditBalance`,
    accessToken
  );

  const spendingPolicies = await listAll(
    `${GRAPH_BETA_ROOT}/spendingPolicies`,
    accessToken
  );

  const policies = [];
  for (const policy of spendingPolicies) {
    const policyId = policy.id;
    const serviceSettings = await listAll(
      `${GRAPH_BETA_ROOT}/spendingPolicies/${encodeURIComponent(policyId)}/serviceSettings`,
      accessToken
    );
    const emailThresholdSettings = await requestJson(
      `${GRAPH_BETA_ROOT}/spendingPolicies/${encodeURIComponent(policyId)}/emailThresholdSettings`,
      accessToken
    ).catch((error) => ({
      error: error.message
    }));
    const recipients =
      emailThresholdSettings && !emailThresholdSettings.error
        ? await readAlertRecipients(accessToken, policyId).catch((error) => [
            { error: error.message }
          ])
        : [];

    policies.push({
      policy,
      serviceSettings,
      emailThresholdSettings,
      recipients
    });
  }

  const userDiagnostics = [];
  for (const userId of userIds) {
    try {
      userDiagnostics.push(await readUserDiagnostic(accessToken, userId));
    } catch (error) {
      userDiagnostics.push({ userId, error: error.message });
    }
  }

  return {
    tenantCreditBalance,
    policies,
    userDiagnostics
  };
}
