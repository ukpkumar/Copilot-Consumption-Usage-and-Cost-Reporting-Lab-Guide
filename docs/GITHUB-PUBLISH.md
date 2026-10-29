# GitHub publish guide

## 1) Prepare repository

From project root:

```powershell
git init
git add .
git commit -m "Initial commit: Copilot tenant cost dashboard collector and automation docs"
```

## 2) Create GitHub repository

Create an empty repo on GitHub (no README/.gitignore/license auto-generation).

## 3) Connect and push

```powershell
git branch -M main
git remote add origin https://github.com/<your-org-or-user>/<repo-name>.git
git push -u origin main
```

## 4) Security checks before pushing

1. Ensure `.env` is not committed.
2. Ensure generated data snapshots are not committed (`data/latest.json`).
3. Ensure no access tokens, secrets, or tenant-private export files are tracked.
4. If a secret was committed by mistake, rotate it immediately and rewrite history.

## 5) Recommended repository settings

- Enable branch protection on `main`.
- Require pull request reviews.
- Enable secret scanning and Dependabot alerts.

