# Reporting API Verifier (Python GUI)

This is a second local app (Python) with interactive tenant sign-in and on-demand endpoint verification.

## Features

- Desktop GUI (Tkinter)
- Preset endpoint picker + custom URL
- Interactive sign-in (`DelegatedDeviceCode`)
- Optional app-only auth (`AppSecret`)
- Reads client ID/secret/tenant from JSON config
- Exports each run to JSON + HTML + history log

## Setup

```powershell
cd "C:\Users\prasuk\OneDrive - Microsoft\Documents\Microsoft Scout\copilot-tenant-cost-dashboard"
python -m pip install -r .\apps\reporting-api-verifier-python\requirements.txt
copy .\apps\reporting-api-verifier-python\config.sample.json .\apps\reporting-api-verifier-python\config.local.json
```

Edit `config.local.json` and set:

- `tenantId`
- `clientId`
- `clientSecret` (needed for AppSecret mode)
- optional `subscriptionId`
- optional `dataverseUrl`

## Launch

```powershell
python .\apps\reporting-api-verifier-python\launch.py --config .\apps\reporting-api-verifier-python\config.local.json
```

For device sign-in:

1. Choose `DelegatedDeviceCode`
2. Click **Run**
3. Complete browser/device-code sign-in

## Output

- `apps/reporting-api-verifier-python/output/run-<timestamp>.json`
- `apps/reporting-api-verifier-python/output/run-<timestamp>.html`
- `apps/reporting-api-verifier-python/output/history.jsonl`

## Notes

- Keep `config.local.json` private; do not commit it.
- Some Graph Copilot endpoints may require delegated auth even if app-only token is valid.

