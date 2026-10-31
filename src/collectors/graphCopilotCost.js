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

async function capture(request, fallback, errors, key) {
  try { return await request(); }
  catch (error) { errors[key] = error.message; return fallback; }
}

async function readUserDiagnostic(accessToken, userId) {
  const resolved = await resolveUserBalanceKey(accessToken, userId);
  const userPath = encodeURIComponent(resolved.balanceKey);
  const errors = {};
  const [balance, serviceBalances] = await Promise.all([
    capture(() => requestJson(`${GRAPH_BETA_ROOT}/userBalances/${userPath}`, accessToken), null, errors, "balance"),
    capture(() => listAll(`${GRAPH_BETA_ROOT}/userBalances/${userPath}/serviceBalances`, accessToken), [], errors, "serviceBalances")
  ]);
  return {
    userId,
    resolvedUserId: resolved.balanceKey,
    resolvedFrom: resolved.resolvedFrom,
    resolvedUserPrincipalName: resolved.resolvedUserPrincipalName,
    balance,
    serviceBalances,
    ...(Object.keys(errors).length ? { errors, error: Object.values(errors).join("; ") } : {})
  };
}

export async function collectGraphCopilotCost(accessToken, userIds = []) {
  const errors = {};
  const [tenantCreditBalance, spendingPolicies] = await Promise.all([
    capture(() => requestJson(`${GRAPH_BETA_ROOT}/getTenantCreditBalance`, accessToken), null, errors, "tenantCreditBalance"),
    capture(() => listAll(`${GRAPH_BETA_ROOT}/spendingPolicies`, accessToken), [], errors, "spendingPolicies")
  ]);

  const policies = [];
  for (const policy of spendingPolicies) {
    const policyId = policy.id;
    const policyPath = `${GRAPH_BETA_ROOT}/spendingPolicies/${encodeURIComponent(policyId)}`;
    const [serviceSettings, emailThresholdSettings, recipients] = await Promise.all([
      capture(() => listAll(`${policyPath}/serviceSettings`, accessToken), [], errors, `policy:${policyId}:serviceSettings`),
      capture(() => requestJson(`${policyPath}/emailThresholdSettings`, accessToken), null, errors, `policy:${policyId}:emailThresholdSettings`),
      capture(() => readAlertRecipients(accessToken, policyId), [], errors, `policy:${policyId}:recipients`)
    ]);

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
    ok: Object.keys(errors).length === 0,
    tenantCreditBalance,
    policies,
    userDiagnostics,
    ...(Object.keys(errors).length ? { errors, error: Object.values(errors).join("; ") } : {})
  };
}
