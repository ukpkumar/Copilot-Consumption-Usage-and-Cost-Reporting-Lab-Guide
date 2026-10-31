# Copilot Tenant Cost Dashboard (Test Tenant)

This sample pulls tenant data from:

1. Microsoft Graph Copilot Cost Management (`/beta/copilot/costManagement/*`)
2. Microsoft Graph Copilot Reports (`/v1.0/copilot/reports/*`)
3. Copilot admin package catalog (`/beta/copilot/admin/catalog/packages*`)
4. Copilot Studio Dataverse analytics (`/api/data/v9.2/bots|botcomponents|conversationtranscripts`)
5. Agent usage (Agent 365 endpoint with Copilot Studio export + Dataverse fallback)
6. Azure Cost Management Query API (`management.azure.com/.../Microsoft.CostManagement/query`)
7. Azure Consumption Usage Details API (`management.azure.com/.../Microsoft.Consumption/usageDetails`)

Then you can view the unified snapshot in `dashboard.html`.

## Documentation

- **Documentation index:** [docs/INDEX.md](./docs/INDEX.md)
- **Full hands-on lab guide:** [docs/LAB-HANDS-ON-GUIDE.md](./docs/LAB-HANDS-ON-GUIDE.md)
- **Optional lab (Python bootstrap):** [docs/REPO-BOOTSTRAP-WITH-PYTHON.md](./docs/REPO-BOOTSTRAP-WITH-PYTHON.md)
- **Reusable PowerShell API verifier:** [docs/POWERSHELL-API-VERIFIER.md](./docs/POWERSHELL-API-VERIFIER.md)

## Identity model (why you might see one app vs two apps)

- **Default lab path (current guide): one app registration** is enough for local device-code collection.
- **Enterprise automation path (optional): two-app model** is common:
  1. Collector app registration (Graph/Dataverse/Azure API access)
  2. Automation host identity (Azure Function managed identity or separate app for unattended runs)

Both are valid. The main lab keeps setup simple with one app.

## 1) App registration

Create an app registration in your tenant:

- **Name**: `Copilot Tenant Cost Dashboard Collector` (or your preferred name)
- **Client ID**: `<your-client-id>`
- **Tenant ID**: `<your-tenant-id>`

Configured:

- Delegated Graph permissions:
  - `CopilotCostManagement.Read.All`
  - `CopilotCostManagement-Policy.Read.All`
  - `Reports.Read.All`
  - `User.Read` (default)
- Application Graph permission:
  - `Reports.Read.All`
- Public client flow:
  - **Allow public client flows** = **Enabled**

## 2) Final tenant-side prerequisite

In Azure subscription scope, assign your app's service principal at least:

- **Cost Management Reader** (or equivalent read role for Cost Management query).

Without this, Azure Cost API calls fail even if Graph works.

## 3) Configure and collect

1. Copy `.env.example` to `.env`.
2. Set:
   - `USER_IDS` (UPN/email or Entra object ID; UPN/email values are auto-resolved to object ID)
   - `AZURE_SUBSCRIPTION_ID` if you also want Azure currency-cost rows.
   - Optional Copilot admin package request filter:
    - `COPILOT_ADMIN_REQUEST_FILTER` (request-properties filter expression for `/copilot/admin/catalog/packages`)
   - Optional Copilot Studio Dataverse analytics:
    - `DATAVERSE_URL` (for example `https://<org>.crm.dynamics.com`)
    - `COPILOT_STUDIO_LOOKBACK_DAYS` (default 30)
    - `COPILOT_STUDIO_TRANSCRIPT_TOP` (default 500)
   - Optional agent usage:
    - `AGENT365_USAGE_URL` (primary source)
    - `COPILOT_STUDIO_USAGE_EXPORT_PATH` (fallback source; JSON/CSV)
3. Run:

```powershell
npm run collect
```

On first run, the script shows device-code sign-in prompts for:

- Graph scope
- Azure Management scope (only when `AZURE_SUBSCRIPTION_ID` is set to a real subscription ID)

After first successful sign-in, tokens are cached and auto-refreshed across runs, so you normally do not need to sign in again each time.

Output is written to:

- `.\data\latest.json`

Agent usage fallback behavior:

1. If `AGENT365_USAGE_URL` is configured and succeeds, `sources.agentUsage.source = "agent365"`.
2. If Agent 365 is not configured/fails, the collector tries Copilot Studio export:
   - `COPILOT_STUDIO_USAGE_EXPORT_PATH`, else
   - `.\data\copilot-studio-usage.json`, else
   - `.\data\copilot-studio-usage.csv`.
3. If no export file is available, the collector falls back to Dataverse conversation transcript rows when `DATAVERSE_URL` is configured.

Copilot admin package APIs in the snapshot:

- List agents/packages: `GET /copilot/admin/catalog/packages`
- Package detail: `GET /copilot/admin/catalog/packages/{id}`
- Request-focused view: same list API with `COPILOT_ADMIN_REQUEST_FILTER`
- Preview management endpoints are documented in `sources.agent365AdminCatalog.apis`:
  - `PATCH /copilot/admin/catalog/packages/{id}`
  - `POST /copilot/admin/catalog/packages/{id}/block`
  - `POST /copilot/admin/catalog/packages/{id}/unblock`
  - `POST /copilot/admin/catalog/packages/{id}/reassign`

Copilot Studio Dataverse APIs in the snapshot:

- `GET /api/data/v9.2/bots`
- `GET /api/data/v9.2/botcomponents`
- `GET /api/data/v9.2/conversationtranscripts`
- `GET /api/data/v9.2/conversationtranscripts/$count`

## 4) Open dashboard

Open `dashboard.html` in a browser and either:

- Click **Load sample (if available)**, or
- Click **Load data JSON** and select `data/latest.json`.

To build a standalone file with the current snapshot embedded:

```powershell
npm run build:dashboard
```

Then open `dashboard.built.html`.

### Local automated dashboard and Graph tester

Requires Node.js 22 or newer; no packages need installing. Reuse the existing Entra registration in `.env`—do not add credentials to HTML or browser storage.

```powershell
# First sign in for each configured resource using the existing collector:
npm run collect
# Then start the local dashboard:
npm start
```

Open the `http://127.0.0.1:<assigned-port>` URL printed in the terminal. The server binds only to loopback on an automatically assigned port. It collects on startup and every 60 minutes while running; configure `COLLECTION_INTERVAL_MINUTES` (minimum 1) in `.env`. **Collect now** triggers a background run. Concurrent triggers share one run. The page polls status/latest data every 10 seconds and retains the last snapshot when collection fails. A successful save can contain partial data: inspect the dashboard's source status, not just the save timestamp.

Each scheduled run invokes all configured collectors—not just the selected Graph test. Graph collection covers tenant credit balance, spending policies and their service/threshold/recipient settings, configured user balances and service balances, Copilot usage details, user count summary/trend, and package catalog/details. Policy and balance reads are isolated so one denied endpoint does not cancel the others. JSON reports follow same-origin pagination; existing report-version fallbacks remain in place. Write/management preview endpoints are documented, not invoked by this read-only dashboard. Optional resource collectors still require their own configuration and access.

**Graph API test** offers fixed, read-only requests for the signed-in user, tenant credit balance, spending policies, Copilot usage/count/trend reports, and package catalog. It displays HTTP status, duration and sanitized response data. Requests use the same delegated Graph scope as the collectors. No arbitrary URLs, methods, token headers, write operations, or local files are accepted. Redirect URLs (including signed report downloads) and upstream error bodies are not exposed; responses over 1 MiB are rejected. The existing CLI report collector still handles its report fallbacks.

Access/refresh tokens remain in the existing server-side cache under `%USERPROFILE%\.copilot-tenant-cost-dashboard`. The server only reuses/refreshes cached sign-in; it never launches device-code prompts through the browser. If consent, Conditional Access, or refresh-token expiry requires sign-in again, run `npm run collect` in a terminal. This is delegated automation, **not** permanent unattended app-only authentication. Existing Graph delegated permissions, admin consent, tenant licensing, and signed-in user roles still apply; Azure requires appropriate cost-reading roles and Dataverse requires its own access.

Only approved same-origin local API routes are exposed; `.env`, the cache, and arbitrary repository files are not served. Tenant data is still sensitive even without tokens: use a trusted local account, protect the cache/snapshots with filesystem permissions, and do not expose this local sample through port forwarding or a public reverse proxy. Stop with Ctrl+C; collection stops when the process exits. Standalone JSON loading and `build:dashboard` remain available as before.

Validation (mocked APIs, no real tenant calls):

```powershell
npm test
npm run check
```

## 5) Cowork app package (skill app)

This project now includes a Cowork skill app package at `cowork-app/`:

- `cowork-app/manifest.json`
- `cowork-app/skills/tenant-cost-dashboard-analyst/SKILL.md`

Build a dashboard snapshot and package zip:

```powershell
npm run build:dashboard
npm run pack:cowork
```

Upload `copilot-tenant-cost-cowork-app.zip` into your Cowork/Copilot app catalog.

## 6) Automation options

- **Azure Function (timer-based):** [docs/AUTOMATION-AZURE-FUNCTION.md](./docs/AUTOMATION-AZURE-FUNCTION.md)
- **Power Automate (scheduled flow):** [docs/AUTOMATION-POWER-AUTOMATE.md](./docs/AUTOMATION-POWER-AUTOMATE.md)

## 7) Publish to GitHub

Follow: [docs/GITHUB-PUBLISH.md](./docs/GITHUB-PUBLISH.md)

## Notes

- Copilot Cost Management API is beta and can change.
- If Graph returns authorization errors, re-check admin consent for newly added permissions.
- Persistent auth cache file location: `%USERPROFILE%\.copilot-tenant-cost-dashboard\token-cache.json`
