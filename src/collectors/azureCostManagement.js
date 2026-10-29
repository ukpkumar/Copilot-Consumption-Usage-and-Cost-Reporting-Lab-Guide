import { listAll, requestJson } from "../lib/http.js";

const COST_QUERY_API_VERSION = "2025-03-01";
const USAGE_DETAILS_API_VERSION = "2024-08-01";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function collectAzureCostManagement(accessToken) {
  const subscriptionId = required("AZURE_SUBSCRIPTION_ID");
  const scope = `/subscriptions/${subscriptionId}`;
  const costQueryEndpoint = `https://management.azure.com${scope}/providers/Microsoft.CostManagement/query?api-version=${COST_QUERY_API_VERSION}`;
  const usageDetailsEndpoint = `https://management.azure.com${scope}/providers/Microsoft.Consumption/usageDetails?api-version=${USAGE_DETAILS_API_VERSION}`;

  const costByServiceBody = {
    type: "Usage",
    timeframe: "MonthToDate",
    dataset: {
      granularity: "Daily",
      aggregation: {
        totalCost: {
          name: "PreTaxCost",
          function: "Sum"
        }
      },
      grouping: [
        {
          type: "Dimension",
          name: "ServiceName"
        }
      ]
    }
  };

  const costBySubscriptionBody = {
    type: "Usage",
    timeframe: "MonthToDate",
    dataset: {
      granularity: "Daily",
      aggregation: {
        totalCost: {
          name: "PreTaxCost",
          function: "Sum"
        }
      },
      grouping: [
        {
          type: "Dimension",
          name: "SubscriptionId"
        }
      ]
    }
  };

  const [costQueryByServiceDaily, costQueryBySubscriptionDaily, usageDetails] = await Promise.all([
    requestJson(costQueryEndpoint, accessToken, { method: "POST", body: costByServiceBody }),
    requestJson(costQueryEndpoint, accessToken, { method: "POST", body: costBySubscriptionBody }),
    listAll(usageDetailsEndpoint, accessToken)
  ]);

  return {
    ok: true,
    apis: {
      costManagementQuery: `${scope}/providers/Microsoft.CostManagement/query?api-version=${COST_QUERY_API_VERSION}`,
      consumptionUsageDetails: `${scope}/providers/Microsoft.Consumption/usageDetails?api-version=${USAGE_DETAILS_API_VERSION}`
    },
    costQueryByServiceDaily,
    costQueryBySubscriptionDaily,
    usageDetails
  };
}
