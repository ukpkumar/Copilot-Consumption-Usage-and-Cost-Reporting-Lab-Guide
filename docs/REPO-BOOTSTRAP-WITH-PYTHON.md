# Optional Lab: Repository Bootstrap with Python

This guide shows exactly how to create a working local lab copy (with all collection files) using Python automation.

## What this script does

`tools/bootstrap_lab_repo.py` performs:

1. Clone the GitHub repository
2. Install npm dependencies
3. Create `.env` from `.env.example` (if missing)
4. Verify required collector and dashboard files exist

## Run it

From any folder:

```powershell
python .\tools\bootstrap_lab_repo.py --repo https://github.com/ukpkumar/Copilot-Consumption-Usage-and-Cost-Reporting-Lab-Guide.git --dest .\lab
```

After it finishes:

1. Open `.\lab\.env`
2. Fill required values:
   - `TENANT_ID`
   - `CLIENT_ID`
   - `AZURE_SUBSCRIPTION_ID`
3. Run:

```powershell
cd .\lab
npm run collect
npm run build:dashboard
```

## Why this answers "how the repository was created"

The repository itself was committed and pushed through Git.  
This script reproduces the full local setup from scratch so a new user gets the exact collection files, project structure, and runnable environment.
