# Power Automate automation (scheduled cloud flow)

This document shows two ways to automate the pipeline with Power Automate.

## Option A (recommended): Power Automate calls an Azure Function HTTP endpoint

1. Build and deploy the Azure Function automation.
2. Add an HTTP-triggered function endpoint for on-demand execution.
3. Create a Scheduled Cloud Flow:
   - Trigger: **Recurrence**
   - Action: **HTTP** (POST to Function endpoint)
   - Action: Save returned artifacts or links to SharePoint/OneDrive
   - Action: Send Teams/Email summary
4. Add failure branch with alert notification.

## Option B: Power Automate Desktop executes local script

Use this only when you need on-machine execution.

1. Provision a stable Windows VM.
2. Install Node.js and dependencies.
3. Create PAD flow:
   - Run PowerShell:
     - `npm ci`
     - `npm run collect`
     - `npm run build:dashboard`
4. Upload artifacts from VM to SharePoint/OneDrive.
5. Trigger PAD flow from Cloud Flow on schedule.

## Flow variables/secrets

Store sensitive values in:

- Azure Key Vault (preferred), or
- Power Automate secure inputs/outputs.

Never place secrets in the flow body as plain text.

## Suggested recurrence

- Daily executive snapshot: once per day (for example 07:00 Asia/Dubai)
- Operational monitoring: every 4 to 6 hours

## Suggested notifications

Include:

- Snapshot timestamp
- Per-source health (`Graph cost`, `Graph reports`, `Agent usage`, `Admin catalog`, `Dataverse`, `Azure cost`)
- Link to `dashboard.built.html`

