#!/usr/bin/env python3
"""
Bootstrap this lab project from GitHub for a first-time user.

What it does:
1) Clones the repository
2) Installs npm dependencies
3) Creates .env from .env.example (if missing)
4) Verifies key collector/dashboard files exist

Usage:
  python tools/bootstrap_lab_repo.py --repo https://github.com/ukpkumar/Copilot-Consumption-Usage-and-Cost-Reporting-Lab-Guide.git --dest .\\lab
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


REQUIRED_FILES = [
    "package.json",
    "src/collect-all.js",
    "src/build-dashboard.js",
    "src/collectors/graphCopilotCost.js",
    "src/collectors/graphCopilotReports.js",
    "src/collectors/azureCostManagement.js",
    "src/collectors/agent365AdminCatalog.js",
    "src/collectors/agentUsage.js",
    "src/collectors/copilotStudioDataverse.js",
    "dashboard.html",
    ".env.example",
]


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print(f"> {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}")


def ensure_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing required file: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap Copilot reporting lab repository.")
    parser.add_argument("--repo", required=True, help="Git repository URL.")
    parser.add_argument("--dest", required=True, help="Destination folder path.")
    args = parser.parse_args()

    dest = Path(args.dest).resolve()
    parent = dest.parent
    parent.mkdir(parents=True, exist_ok=True)

    if dest.exists():
        if any(dest.iterdir()):
            raise RuntimeError(f"Destination is not empty: {dest}")
    else:
        dest.mkdir(parents=True)

    git_path = shutil.which("git")
    npm_path = shutil.which("npm")
    if not git_path:
        raise RuntimeError("git is not installed or not in PATH.")
    if not npm_path:
        raise RuntimeError("npm is not installed or not in PATH.")

    run(["git", "clone", args.repo, str(dest)])
    run(["npm", "install"], cwd=dest)

    env_example = dest / ".env.example"
    env_file = dest / ".env"
    ensure_file(env_example)
    if not env_file.exists():
        env_file.write_text(env_example.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Created: {env_file}")
    else:
        print(f"Exists: {env_file}")

    for rel in REQUIRED_FILES:
        ensure_file(dest / rel)

    print("\nBootstrap completed successfully.")
    print("Next steps:")
    print("1) Open .env and fill TENANT_ID, CLIENT_ID, AZURE_SUBSCRIPTION_ID, and optional values.")
    print("2) Run: npm run collect")
    print("3) Run: npm run build:dashboard")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # explicit fail with message
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

