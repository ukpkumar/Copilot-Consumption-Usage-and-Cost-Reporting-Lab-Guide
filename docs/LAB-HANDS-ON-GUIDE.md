# Copilot Consumption, Usage, and Cost Reporting Lab Guide (Hands-On)

This lab is written for users who are not experts. Follow each step in order and you can complete setup, data collection, dashboard generation, and automation.

## Lab outcome

By the end, you will have:

1. A working app registration and permissions model.
2. A working local data collector.
3. A dashboard with unified data from Graph, Azure Cost Management, Agent catalog, and Copilot Studio Dataverse.
4. Optional automation using Azure Function or Power Automate.

## Time estimate

- Basic setup + first successful run: 45 to 90 minutes
- Automation setup: 30 to 90 minutes

## Before you start

You need:

- A Windows machine with internet access
- A tenant where you can create app registrations
- Access to Microsoft Graph permissions/admin consent workflow
- Access to the Azure subscription (for Azure cost data)
- Optional: access to Copilot Studio Dataverse environment

## Step 1: Install local tools

1. Install **Node.js LTS** (v20+ recommended):  
   https://nodejs.org/
2. Open **PowerShell**.
3. Verify installation:

```powershell
node -v
npm -v
```

If both commands return versions, continue.

## Step 2: Get the project code

1. Open PowerShell.
2. Clone your GitHub repository:

```powershell
git clone https://github.com/ukpkumar/Copilot-Consumption-Usage-and-Cost-Reporting-Lab-Guide.git
cd Copilot-Consumption-Usage-and-Cost-Reporting-Lab-Guide
```

3. Install dependencies:

```powershell
npm install
```

## Step 3: Create app registration in Entra

1. Open Microsoft Entra admin center:  
   https://entra.microsoft.com
2. Go to **Identity** > **Applications** > **App registrations**.
3. Click **New registration**.
4. Name: `Copilot Tenant Cost Dashboard Collector`.
5. Supported account type: **Accounts in this organizational directory only**.
6. Click **Register**.
7. Copy and save:
   - **Application (client) ID** (this is `CLIENT_ID`)
   - **Directory (tenant) ID** (this is `TENANT_ID`)

## Step 4: Enable public client flow (for local device-code sign-in)

1. In the app registration, open **Authentication**.
2. Scroll to **Advanced settings**.
3. Set **Allow public client flows** to **Yes**.
4. Click **Save**.

## Step 5: Add Graph API permissions

1. In the app registration, open **API permissions**.
2. Click **Add a permission** > **Microsoft Graph**.
3. Add delegated permissions:
   - `CopilotCostManagement.Read.All`
   - `CopilotCostManagement-Policy.Read.All`
   - `Reports.Read.All`
   - `User.Read`
4. Add application permission:
   - `Reports.Read.All`
5. Click **Grant admin consent**.
6. Confirm all required permissions show as **Granted**.

## Step 6: Add Azure Cost Management access

1. Open Azure portal:  
   https://portal.azure.com
2. Go to **Subscriptions** > select your subscription.
3. Open **Access control (IAM)** > **Add role assignment**.
4. Role: **Cost Management Reader** (or equivalent read role).
5. Assign access to the app’s service principal.
6. Save.
7. Copy the **Subscription ID** (this is `AZURE_SUBSCRIPTION_ID`).

## Step 7: Configure `.env`

1. In project root, copy the sample file:

```powershell
copy .env.example .env
```

2. Open `.env` and set values:

```env
TENANT_ID=<your-tenant-id>
CLIENT_ID=<your-client-id>
AZURE_SUBSCRIPTION_ID=<your-subscription-id>
USER_IDS=<optional-comma-separated-user-upns>

# Optional Agent usage source #1
AGENT365_USAGE_URL=<optional-agent-usage-endpoint>

# Optional Agent usage source #2
COPILOT_STUDIO_USAGE_EXPORT_PATH=.\data\copilot-studio-usage.json

# Optional request queue filter
COPILOT_ADMIN_REQUEST_FILTER=requestStatus eq 'pending'

# Optional Dataverse source
DATAVERSE_URL=https://<org>.crm.dynamics.com
COPILOT_STUDIO_LOOKBACK_DAYS=30
COPILOT_STUDIO_TRANSCRIPT_TOP=500
```

## Step 8: Run collection

1. Run:

```powershell
npm run collect
```

2. If prompted for device-code auth:
   - Open the URL shown in terminal (`https://login.microsoft.com/device`)
   - Enter the code shown in terminal
   - Complete sign-in
3. Wait for command completion.
4. Confirm output exists:

```powershell
dir .\data\latest.json
```

## Step 9: Build dashboard

1. Build standalone dashboard:

```powershell
npm run build:dashboard
```

2. Confirm output:

```powershell
dir .\dashboard.built.html
```

3. Open `dashboard.html` or `dashboard.built.html` in a browser.

## Step 10: Validate source status in dashboard

In the dashboard, check **Source Health**:

- Graph Copilot Cost Management
- Graph Copilot Reports
- Agent Usage
- Agent 365 Admin Catalog
- Copilot Studio Dataverse
- Azure Cost Management

If a source is `warn`/`error`, the reason appears in the notes.

## How Agent Usage is filled

The collector uses this priority:

1. `AGENT365_USAGE_URL` (if configured and successful)
2. `COPILOT_STUDIO_USAGE_EXPORT_PATH` (or default files under `data/`)
3. Dataverse `conversationtranscripts` (when `DATAVERSE_URL` is configured)

If all are missing/unavailable, `sources.agentUsage` is skipped.

## Troubleshooting quick map

### A) `403` on Graph APIs

- Re-check API permissions and admin consent.
- Confirm your account has required admin roles/licensing.
- Re-run after consent propagation delay.

### B) Azure `fetch failed` or auth issues

- Confirm subscription ID is valid.
- Confirm role assignment on subscription scope.
- Re-run sign-in and retry.

### C) Agent usage empty

- Set `AGENT365_USAGE_URL`, or
- Provide export file (`copilot-studio-usage.json/csv`), or
- Set valid `DATAVERSE_URL`.

### D) Dataverse source unavailable

- Verify URL format (`https://<org>.crm.dynamics.com`).
- Verify account/app access to Dataverse tables:
  - `bot`
  - `botcomponent`
  - `conversationtranscript`

### E) Device code expires

- Re-run command to generate a fresh device code.
- Complete sign-in immediately.

## Automation path 1: Azure Function

Use `docs/AUTOMATION-AZURE-FUNCTION.md` and follow:

1. Create Function App (Node.js)
2. Deploy project
3. Configure environment variables
4. Configure timer trigger
5. Validate one manual run

## Automation path 2: Power Automate

Use `docs/AUTOMATION-POWER-AUTOMATE.md` and follow:

1. Create scheduled cloud flow
2. Call Azure Function HTTP endpoint (recommended), or run PAD flow
3. Store secrets securely
4. Add notifications and failure branch

## GitHub publishing flow

Use `docs/GITHUB-PUBLISH.md` for push workflow and repository hardening.

## Recommended operating routine

1. Run `npm run collect`
2. Run `npm run build:dashboard`
3. Review dashboard source health
4. If all good, share dashboard artifact
5. Keep secrets out of Git commits (`.env` must stay local)
