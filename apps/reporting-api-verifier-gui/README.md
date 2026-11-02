# Reporting API Verifier GUI (PowerShell Desktop App)

This is a local desktop GUI app to test reporting endpoints on demand with your app credentials from JSON.

## Features

- Windows GUI launchable from PowerShell
- Preset endpoint selector (Graph, Azure ARM, Dataverse)
- Custom URL testing
- Auth modes:
  - `AppSecret` (client ID + client secret from JSON)
  - `DelegatedDeviceCode` (interactive user sign-in)
- JSON variables for URL placeholders (`{policyId}`, `{packageId}`, `{userId}`, etc.)
- Exports each run to:
  - JSON envelope
  - HTML report (demo/customer-friendly)
  - history log

## Setup

1. Copy sample config:

```powershell
copy .\apps\reporting-api-verifier-gui\config.sample.json .\apps\reporting-api-verifier-gui\config.local.json
copy .\apps\reporting-api-verifier-gui\credentials.sample.json .\apps\reporting-api-verifier-gui\credentials.local.json
```

2. Edit `credentials.local.json` and set:
   - `tenantId`
   - `clientId`
   - `clientSecret`

3. Edit `config.local.json` and set:
   - `credentialsFile` (path to your credentials JSON)
   - optional `subscriptionId`
   - optional `dataverseUrl`

## Launch

```powershell
cd "C:\Users\prasuk\OneDrive - Microsoft\Documents\Microsoft Scout\copilot-tenant-cost-dashboard"
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\reporting-api-verifier-gui\Launch-ApiVerifierGui.ps1 -ConfigPath .\apps\reporting-api-verifier-gui\config.local.json
```

Double-click launcher:

- `apps/reporting-api-verifier-gui/Launch-ReportingApiVerifierGUI.cmd`

Desktop shortcut (one-time setup):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Create-ApiVerifierShortcuts.ps1
```

## Output files

- `apps/reporting-api-verifier-gui/output/run-<timestamp>.json`
- `apps/reporting-api-verifier-gui/output/run-<timestamp>.html`
- `apps/reporting-api-verifier-gui/output/history.jsonl`

## Notes

- Some Graph Copilot endpoints can return `403` in app-only mode even with permissions; try `DelegatedDeviceCode` when needed.
- Do not commit `config.local.json` or `credentials.local.json`.
