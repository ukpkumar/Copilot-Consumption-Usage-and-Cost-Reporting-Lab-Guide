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
