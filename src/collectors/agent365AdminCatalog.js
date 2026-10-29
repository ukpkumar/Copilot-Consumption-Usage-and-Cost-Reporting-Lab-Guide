import { listAll, requestJson } from "../lib/http.js";

const GRAPH_BETA_ROOT = "https://graph.microsoft.com/beta";
const PACKAGE_COLLECTION_PATH = "/copilot/admin/catalog/packages";

function buildPackagesUrl(filterExpression) {
  const base = `${GRAPH_BETA_ROOT}${PACKAGE_COLLECTION_PATH}`;
  if (!filterExpression) {
    return base;
  }
  return `${base}?$filter=${encodeURIComponent(filterExpression)}`;
}

async function readPackageDetails(accessToken, packageId) {
  try {
    const detail = await requestJson(
      `${GRAPH_BETA_ROOT}${PACKAGE_COLLECTION_PATH}/${encodeURIComponent(packageId)}`,
      accessToken
    );
    return { ok: true, id: packageId, detail };
  } catch (error) {
    return { ok: false, id: packageId, error: error.message };
  }
}

function summarizePackages(packages) {
  const states = {};
  for (const pkg of packages) {
    const rawState =
      pkg?.state || pkg?.status || pkg?.lifecycleState || pkg?.approvalStatus || "unknown";
    const key = String(rawState).trim() || "unknown";
    states[key] = (states[key] || 0) + 1;
  }
  return {
    totalPackages: packages.length,
    byState: states
  };
}

export async function collectAgent365AdminCatalog(accessToken) {
  const requestFilter = (process.env.COPILOT_ADMIN_REQUEST_FILTER || "").trim();
  const listUrl = buildPackagesUrl();

  let packages;
  try {
    packages = await listAll(listUrl, accessToken);
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      apis: {
        listPackages: `GET ${PACKAGE_COLLECTION_PATH}`,
        getPackageDetail: `GET ${PACKAGE_COLLECTION_PATH}/{id}`,
        updatePackageMetadataPreview: `PATCH ${PACKAGE_COLLECTION_PATH}/{id}`,
        blockPackagePreview: `POST ${PACKAGE_COLLECTION_PATH}/{id}/block`,
        unblockPackagePreview: `POST ${PACKAGE_COLLECTION_PATH}/{id}/unblock`,
        reassignPackagePreview: `POST ${PACKAGE_COLLECTION_PATH}/{id}/reassign`
      }
    };
  }

  const detailResults = await Promise.all(
    packages
      .map((pkg) => pkg?.id)
      .filter(Boolean)
      .map((id) => readPackageDetails(accessToken, id))
  );

  let requestsView;
  if (requestFilter) {
    try {
      const requestPackages = await listAll(buildPackagesUrl(requestFilter), accessToken);
      requestsView = {
        ok: true,
        filter: requestFilter,
        packageCount: requestPackages.length,
        packages: requestPackages
      };
    } catch (error) {
      requestsView = {
        ok: false,
        filter: requestFilter,
        error: error.message
      };
    }
  } else {
    requestsView = {
      ok: false,
      skipped: true,
      reason:
        "COPILOT_ADMIN_REQUEST_FILTER is not set. Set it to the request-properties filter expression from docs when needed."
    };
  }

  return {
    ok: true,
    apis: {
      listPackages: `GET ${PACKAGE_COLLECTION_PATH}`,
      getPackageDetail: `GET ${PACKAGE_COLLECTION_PATH}/{id}`,
      updatePackageMetadataPreview: `PATCH ${PACKAGE_COLLECTION_PATH}/{id}`,
      blockPackagePreview: `POST ${PACKAGE_COLLECTION_PATH}/{id}/block`,
      unblockPackagePreview: `POST ${PACKAGE_COLLECTION_PATH}/{id}/unblock`,
      reassignPackagePreview: `POST ${PACKAGE_COLLECTION_PATH}/{id}/reassign`
    },
    summary: summarizePackages(packages),
    packages,
    packageDetails: detailResults,
    requestsView
  };
}
