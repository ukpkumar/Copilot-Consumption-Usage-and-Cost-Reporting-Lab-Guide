# Copilot Consumption, Usage, and Cost Reporting Lab Guide

This hands-on lab is designed for beginners and non-experts. Follow the steps in order to set up permissions, collect data, generate dashboards, and optionally automate the process.

## Table of contents

- [Lab 0 - What you will build](#lab-0---what-you-will-build)
- [Lab 0.1 - Identity model (one app vs two apps)](#lab-01---identity-model-one-app-vs-two-apps)
- [Lab 1 - Prepare your machine](#lab-1---prepare-your-machine)
- [Lab 2 - Register the Entra application](#lab-2---register-the-entra-application)
- [Lab 3 - Configure Graph permissions](#lab-3---configure-graph-permissions)
- [Lab 4 - Configure Azure subscription access](#lab-4---configure-azure-subscription-access)
- [Lab 5 - Configure project environment variables](#lab-5---configure-project-environment-variables)
- [Lab 6 - Run your first data collection](#lab-6---run-your-first-data-collection)
- [Lab 7 - Build and open the dashboard](#lab-7---build-and-open-the-dashboard)
- [Lab 8 - Validate data sources and usage coverage](#lab-8---validate-data-sources-and-usage-coverage)
- [Lab 9 - Troubleshooting guide](#lab-9---troubleshooting-guide)
- [Lab 10 - Automation paths](#lab-10---automation-paths)
- [Lab 11 - Publish and operate](#lab-11---publish-and-operate)

## Lab 0 - What you will build

By the end of this guide you will have:

1. A working collector for Microsoft Graph, Azure Cost Management, Agent catalog, and Copilot Studio Dataverse.
2. A unified JSON snapshot (`data/latest.json`).
3. A shareable HTML dashboard (`dashboard.built.html`).
4. Optional scheduled automation (Azure Function or Power Automate).

Estimated time:

- Initial setup and first successful run: 45-90 minutes
- Automation setup: 30-90 minutes

## Lab 0.1 - Identity model (one app vs two apps)

You may see either one or two identities in Entra, depending on deployment style:

1. **One-app model (used in this hands-on lab):**
   - Single app registration used for local device-code execution.
2. **Two-app model (common in automation):**
   - App 1: data collector API identity (Graph/Dataverse/Azure scopes)
   - App 2: automation host identity (for example, Azure Function managed identity or separate app registration)

If you created two apps yesterday, that is expected for automation architecture.  
This guide starts with one app so beginners can finish the lab faster.

## Lab 1 - Prepare your machine

Prerequisites:

- Windows machine
- Internet access
- Permission to create app registrations in your tenant
- Access to Azure subscription IAM for cost-reader assignment

Install tools:

1. Install Node.js LTS (Node 20+ recommended): https://nodejs.org/
2. Open PowerShell.
3. Verify:

```powershell
node -v
npm -v
git --version
```

Clone the project:

```powershell
git clone https://github.com/ukpkumar/Copilot-Consumption-Usage-and-Cost-Reporting-Lab-Guide.git
cd Copilot-Consumption-Usage-and-Cost-Reporting-Lab-Guide
npm install
```

## Lab 2 - Register the Entra application

1. Open https://entra.microsoft.com
2. Go to **Identity** > **Applications** > **App registrations**
3. Select **New registration**
4. Enter name: `Copilot Tenant Cost Dashboard Collector`
5. Choose: **Accounts in this organizational directory only**
6. Select **Register**
7. Save these values from **Overview**:
   - **Application (client) ID** -> `CLIENT_ID`
   - **Directory (tenant) ID** -> `TENANT_ID`

Enable device-code/public client flow:

1. Open **Authentication**
2. Under **Advanced settings**, set **Allow public client flows** = **Yes**
3. Click **Save**

## Lab 3 - Configure Graph permissions

1. Open app registration > **API permissions**
2. Select **Add a permission** > **Microsoft Graph**
3. Add delegated permissions:
   - `CopilotCostManagement.Read.All`
   - `CopilotCostManagement-Policy.Read.All`
   - `Reports.Read.All`
   - `User.Read`
4. Add application permission:
   - `Reports.Read.All`
5. Select **Grant admin consent**
6. Confirm status is **Granted** for required permissions

## Lab 4 - Configure Azure subscription access

1. Open https://portal.azure.com
2. Go to **Subscriptions** and select your target subscription
3. Copy **Subscription ID** -> `AZURE_SUBSCRIPTION_ID`
4. Go to **Access control (IAM)** > **Add role assignment**
5. Role: **Cost Management Reader** (or equivalent)
6. Assign to the app's service principal
7. Save changes

## Lab 5 - Configure project environment variables

Create your local env file:

```powershell
copy .env.example .env
```

Edit `.env`:

```env
TENANT_ID=<your-tenant-id>
CLIENT_ID=<your-client-id>
AZURE_SUBSCRIPTION_ID=<your-subscription-id>

# Optional diagnostics users (comma-separated UPNs or object IDs)
USER_IDS=user1@contoso.com,user2@contoso.com

# Agent usage source priority #1 (optional)
AGENT365_USAGE_URL=https://graph.microsoft.com/beta/<your-agent-usage-endpoint>

# Agent usage source priority #2 (optional fallback file)
COPILOT_STUDIO_USAGE_EXPORT_PATH=.\data\copilot-studio-usage.json

# Optional request queue filter
COPILOT_ADMIN_REQUEST_FILTER=requestStatus eq 'pending'

# Dataverse source (recommended for Copilot Studio coverage)
DATAVERSE_URL=https://<org>.crm.dynamics.com
COPILOT_STUDIO_LOOKBACK_DAYS=30
COPILOT_STUDIO_TRANSCRIPT_TOP=500

# Optional output path
OUTPUT_PATH=.\data\latest.json
```

## Lab 6 - Run your first data collection

Run:

```powershell
npm run collect
```

If prompted for device-code sign-in:

1. Open `https://login.microsoft.com/device`
2. Enter the code shown in terminal
3. Complete sign-in
4. Return to terminal and wait for completion

Confirm output file:

```powershell
dir .\data\latest.json
```

## Lab 7 - Build and open the dashboard

Build:

```powershell
npm run build:dashboard
```

Open:

- `dashboard.html` (load JSON manually), or
- `dashboard.built.html` (self-contained with embedded snapshot)

## Lab 8 - Validate data sources and usage coverage

In the dashboard, review **Source Health**:

- Graph Copilot Cost Management
- Graph Copilot Reports
- Agent Usage
- Agent 365 Admin Catalog
- Copilot Studio Dataverse
- Azure Cost Management

Agent usage source priority:

1. `AGENT365_USAGE_URL`
2. `COPILOT_STUDIO_USAGE_EXPORT_PATH` (or default files in `data`)
3. Dataverse `conversationtranscripts` via `DATAVERSE_URL`

If all three are unavailable, agent usage will be skipped.

## Lab 9 - Troubleshooting guide

### 9.1 Graph API `403`

- Recheck permission scopes and admin consent
- Verify your account role/licensing
- Wait and retry after consent propagation

### 9.2 Azure `fetch failed` or empty cost results

- Verify `AZURE_SUBSCRIPTION_ID`
- Verify IAM role assignment at subscription scope
- Retry authentication

### 9.3 Copilot Studio usage missing

- Set `AGENT365_USAGE_URL`, or
- Provide a usage export file (`.json`/`.csv`), or
- Set valid `DATAVERSE_URL`

### 9.4 Dataverse source unavailable

- Validate URL format: `https://<org>.crm.dynamics.com`
- Validate access to Dataverse tables:
  - `bot`
  - `botcomponent`
  - `conversationtranscript`

### 9.5 Device code expired

- Re-run the command and use the new code immediately

## Lab 10 - Automation paths

Choose one:

1. **Azure Function (timer-based)**  
   Follow: [AUTOMATION-AZURE-FUNCTION.md](./AUTOMATION-AZURE-FUNCTION.md)
2. **Power Automate (scheduled cloud flow)**  
   Follow: [AUTOMATION-POWER-AUTOMATE.md](./AUTOMATION-POWER-AUTOMATE.md)

## Lab 11 - Publish and operate

Publishing guide:

- [GITHUB-PUBLISH.md](./GITHUB-PUBLISH.md)

Operational routine:

1. Run `npm run collect`
2. Run `npm run build:dashboard`
3. Review source health
4. Share artifacts after validation
5. Keep `.env` local and never commit secrets
