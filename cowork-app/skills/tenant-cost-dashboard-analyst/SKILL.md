---
name: tenant-cost-dashboard-analyst
description: |
  Analyzes Copilot tenant cost snapshots (Graph + Azure) and produces executive summaries,
  policy diagnostics, and user/service spend insights.
license: MIT
metadata:
  author: Microsoft
  version: "0.1.0"
---

# Tenant Cost Dashboard Analyst

Use this skill when the user asks to analyze tenant cost and usage data produced by the Copilot Tenant Cost Dashboard collector.

## Input expectations

- Primary input file: `data/latest.json` from the collector.
- Optional: `dashboard.built.html` when the JSON is embedded for sharing.

## Workflow

1. Confirm snapshot freshness from `generatedAt`.
2. Summarize top-level health for:
   - Graph Copilot Cost Management
   - Graph Copilot Reports
   - Azure Cost Management
3. Extract policy insights:
   - total policies
   - enabled vs disabled
   - recipients configured
4. Extract user diagnostics:
   - resolved user IDs
   - allowed/blocked services
   - noteworthy balance constraints
5. Extract Azure cost shape:
   - row counts
   - service-level distribution
   - subscription-level distribution
6. Flag data-quality issues only when present (missing fields, skipped sources, stale timestamps, failed API segments).

## Response requirements

- Start with a one-paragraph executive summary.
- Then present concise tables for policy and user/service findings.
- Clearly separate confirmed facts from assumptions.
- Do not invent missing values.
