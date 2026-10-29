import { requestJson, requestText } from "../lib/http.js";

const GRAPH_V1_ROOT = "https://graph.microsoft.com/v1.0/copilot/reports";
const GRAPH_BETA_ROOT = "https://graph.microsoft.com/beta/copilot/reports";

async function tryRequest(url, token, format) {
  try {
    const data =
      format === "json" ? await requestJson(url, token) : await requestText(url, token);
    return { ok: true, url, format, data };
  } catch (error) {
    return { ok: false, url, format, error: error.message };
  }
}

async function getWithFallbacks(accessToken, attempts) {
  const errors = [];
  for (const attempt of attempts) {
    const result = await tryRequest(attempt.url, accessToken, attempt.format);
    if (result.ok) {
      return {
        ok: true,
        source: attempt.source,
        url: result.url,
        format: result.format,
        data: result.data
      };
    }
    errors.push({
      source: attempt.source,
      url: result.url,
      format: result.format,
      error: result.error
    });
  }

  return { ok: false, errors };
}

export async function collectGraphCopilotReports(accessToken) {
  const usageDetail = await getWithFallbacks(accessToken, [
    {
      source: "beta-json-v2",
      format: "json",
      url: `${GRAPH_BETA_ROOT}/getMicrosoft365CopilotUsageUserDetail(period='D28',version='v2')`
    },
    {
      source: "beta-json-v2-no-version",
      format: "json",
      url: `${GRAPH_BETA_ROOT}/getMicrosoft365CopilotUsageUserDetail(period='D28')`
    },
    {
      source: "v1-csv",
      format: "text",
      url: `${GRAPH_V1_ROOT}/getMicrosoft365CopilotUsageUserDetail(period='D30',version='v1')`
    }
  ]);

  const userCountSummary = await getWithFallbacks(accessToken, [
    {
      source: "beta-json-v2",
      format: "json",
      url: `${GRAPH_BETA_ROOT}/getMicrosoft365CopilotUserCountSummary(period='D28',version='v2')`
    },
    {
      source: "v1-json",
      format: "json",
      url: `${GRAPH_V1_ROOT}/getMicrosoft365CopilotUserCountSummary(period='D30',version='v1')`
    },
    {
      source: "v1-csv",
      format: "text",
      url: `${GRAPH_V1_ROOT}/getMicrosoft365CopilotUserCountSummary(period='D30',version='v1')`
    }
  ]);

  const userCountTrend = await getWithFallbacks(accessToken, [
    {
      source: "beta-json-v2",
      format: "json",
      url: `${GRAPH_BETA_ROOT}/getMicrosoft365CopilotUserCountTrend(period='D28',version='v2')`
    },
    {
      source: "v1-json",
      format: "json",
      url: `${GRAPH_V1_ROOT}/getMicrosoft365CopilotUserCountTrend(period='D30',version='v1')`
    },
    {
      source: "v1-csv",
      format: "text",
      url: `${GRAPH_V1_ROOT}/getMicrosoft365CopilotUserCountTrend(period='D30',version='v1')`
    }
  ]);

  return { usageDetail, userCountSummary, userCountTrend };
}
