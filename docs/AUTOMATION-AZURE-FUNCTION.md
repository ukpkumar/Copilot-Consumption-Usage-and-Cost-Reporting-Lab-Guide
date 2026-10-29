# Azure Function automation (timer-based)

This document shows how to run collection and dashboard build on a schedule using Azure Functions.

## 1) Target architecture

1. Timer trigger starts the function on a schedule.
2. Function runs:
   - `node src/collect-all.js`
   - `node src/build-dashboard.js`
3. Function publishes artifacts (`data/latest.json`, `dashboard.built.html`) to a storage target (Blob, SharePoint, or OneDrive).

## 2) Identity and auth model

For unattended automation, use **app-only auth** (client credentials or managed identity).  
Avoid device-code flow in production automation.

Recommended:

- Graph APIs: app registration with required Graph application permissions.
- Azure Cost APIs: managed identity or service principal with Cost Management read permissions.
- Dataverse: application user with proper Dataverse security roles.

## 3) App settings

Configure these in Function App settings:

- `TENANT_ID`
- `CLIENT_ID`
- `CLIENT_SECRET` (if not using managed identity)
- `AZURE_SUBSCRIPTION_ID`
- `USER_IDS` (optional)
- `AGENT365_USAGE_URL` (optional)
- `COPILOT_STUDIO_USAGE_EXPORT_PATH` (optional)
- `COPILOT_ADMIN_REQUEST_FILTER` (optional)
- `DATAVERSE_URL` (optional)
- `COPILOT_STUDIO_LOOKBACK_DAYS` (optional)
- `COPILOT_STUDIO_TRANSCRIPT_TOP` (optional)
- `OUTPUT_PATH` (optional; default `.\data\latest.json`)

## 4) Timer schedule example

Use NCRONTAB in `function.json`:

```json
{
  "bindings": [
    {
      "name": "myTimer",
      "type": "timerTrigger",
      "direction": "in",
      "schedule": "0 0 */6 * * *"
    }
  ]
}
```

This runs every 6 hours.

## 5) Deployment checklist

1. Create Function App (Node.js 20+ recommended).
2. Deploy this project code.
3. Set all app settings.
4. Grant API permissions and admin consent.
5. Assign Azure role for cost access on the target subscription.
6. Validate one manual run from the Azure portal.
7. Enable timer trigger.

## 6) Operational guidance

- Log each source status (`ok/skipped/error`) for supportability.
- Alert on failures (Application Insights + Action Group).
- Keep generated artifacts versioned by timestamp if you need history.

