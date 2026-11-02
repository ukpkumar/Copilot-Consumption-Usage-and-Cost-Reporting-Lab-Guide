import argparse
import datetime as dt
import json
import os
import re
import threading
import webbrowser
from pathlib import Path
from tkinter import Tk, Label, Entry, Text, Button, StringVar, END, messagebox
from tkinter import ttk

import msal
import requests


PRESETS = [
    {"name": "graph-cost-tenant-balance", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/costManagement/getTenantCreditBalance"},
    {"name": "graph-cost-spending-policies", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies"},
    {"name": "graph-cost-policy-service-settings", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/serviceSettings"},
    {"name": "graph-cost-policy-email-settings", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/emailThresholdSettings"},
    {"name": "graph-cost-policy-recipients", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/costManagement/spendingPolicies/{policyId}/emailThresholdSettings/recipients"},
    {"name": "graph-cost-user-balance", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/costManagement/userBalances/{userId}"},
    {"name": "graph-cost-user-service-balances", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/costManagement/userBalances/{userId}/serviceBalances"},
    {"name": "graph-report-usage-detail-beta-v2", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='D28',version='v2')"},
    {"name": "graph-report-user-count-summary-beta-v2", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUserCountSummary(period='D28',version='v2')"},
    {"name": "graph-report-user-count-trend-beta-v2", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/reports/getMicrosoft365CopilotUserCountTrend(period='D28',version='v2')"},
    {"name": "graph-admin-packages", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/admin/catalog/packages"},
    {"name": "graph-admin-package-detail", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}"},
    {"name": "graph-admin-packages-request-filter", "scope": "graph", "method": "GET", "url": "https://graph.microsoft.com/beta/copilot/admin/catalog/packages?$filter={requestFilter}"},
    {"name": "graph-admin-package-block-preview", "scope": "graph", "method": "POST", "url": "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}/block", "defaultBody": {}},
    {"name": "graph-admin-package-unblock-preview", "scope": "graph", "method": "POST", "url": "https://graph.microsoft.com/beta/copilot/admin/catalog/packages/{packageId}/unblock", "defaultBody": {}},
    {
        "name": "azure-cost-query-by-service",
        "scope": "arm",
        "method": "POST",
        "url": "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2025-03-01",
        "defaultBody": {
            "type": "Usage",
            "timeframe": "MonthToDate",
            "dataset": {
                "granularity": "Daily",
                "aggregation": {"totalCost": {"name": "PreTaxCost", "function": "Sum"}},
                "grouping": [{"type": "Dimension", "name": "ServiceName"}],
            },
        },
    },
    {
        "name": "azure-cost-query-by-subscription",
        "scope": "arm",
        "method": "POST",
        "url": "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2025-03-01",
        "defaultBody": {
            "type": "Usage",
            "timeframe": "MonthToDate",
            "dataset": {
                "granularity": "Daily",
                "aggregation": {"totalCost": {"name": "PreTaxCost", "function": "Sum"}},
                "grouping": [{"type": "Dimension", "name": "SubscriptionId"}],
            },
        },
    },
    {"name": "azure-usage-details", "scope": "arm", "method": "GET", "url": "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Consumption/usageDetails?api-version=2024-08-01"},
    {"name": "dataverse-bots", "scope": "dataverse", "method": "GET", "url": "{dataverseUrl}/api/data/v9.2/bots?$select=botid,name,createdon,modifiedon,statecode,statuscode"},
    {"name": "dataverse-botcomponents", "scope": "dataverse", "method": "GET", "url": "{dataverseUrl}/api/data/v9.2/botcomponents?$select=botcomponentid,name,createdon,modifiedon,statecode,statuscode,_botid_value"},
    {"name": "dataverse-conversationtranscripts", "scope": "dataverse", "method": "GET", "url": "{dataverseUrl}/api/data/v9.2/conversationtranscripts"},
    {"name": "dataverse-conversationtranscripts-count", "scope": "dataverse", "method": "GET", "url": "{dataverseUrl}/api/data/v9.2/conversationtranscripts/$count"},
]


def parse_args():
    parser = argparse.ArgumentParser(description="Reporting API Verifier GUI (Python)")
    parser.add_argument("--config", default="apps/reporting-api-verifier-python/config.local.json")
    parser.add_argument("--credentials")
    parser.add_argument("--list-presets", action="store_true")
    return parser.parse_args()


def load_config(path_str: str, repo_root: Path) -> dict:
    cfg_path = Path(path_str)
    if not cfg_path.is_absolute():
        cfg_path = (repo_root / cfg_path).resolve()
    if not cfg_path.exists():
        raise FileNotFoundError(f"Config file not found: {cfg_path}")
    return json.loads(cfg_path.read_text(encoding="utf-8"))


def load_json_file(path_str: str, repo_root: Path, label: str) -> tuple[dict, Path]:
    cfg_path = Path(path_str)
    if not cfg_path.is_absolute():
        cfg_path = (repo_root / cfg_path).resolve()
    if not cfg_path.exists():
        raise FileNotFoundError(f"{label} file not found: {cfg_path}")
    return json.loads(cfg_path.read_text(encoding="utf-8")), cfg_path


def resolve_template(template: str, variables: dict) -> str:
    resolved = template
    for k, v in variables.items():
        resolved = resolved.replace(f"{{{k}}}", str(v))
    missing = sorted(set(re.findall(r"\{[a-zA-Z0-9_]+\}", resolved)))
    if missing:
        raise ValueError(f"Missing variables: {', '.join(missing)}")
    return resolved


def get_scope(scope_kind: str, auth_mode: str, dataverse_url: str | None) -> str:
    if scope_kind == "graph":
        return "https://graph.microsoft.com/.default" if auth_mode == "AppSecret" else "https://graph.microsoft.com/.default offline_access openid profile"
    if scope_kind == "arm":
        return "https://management.azure.com/.default" if auth_mode == "AppSecret" else "https://management.azure.com/user_impersonation offline_access openid profile"
    if scope_kind == "dataverse":
        if not dataverse_url:
            raise ValueError("dataverseUrl is required for dataverse scope")
        origin = re.match(r"^https?://[^/]+", dataverse_url.strip().rstrip("/"))
        if not origin:
            raise ValueError("Invalid dataverseUrl")
        return f"{origin.group(0)}/.default" if auth_mode == "AppSecret" else f"{origin.group(0)}/.default offline_access openid profile"
    raise ValueError(f"Unsupported scope: {scope_kind}")


def acquire_token(auth_mode: str, tenant_id: str, client_id: str, client_secret: str | None, scope: str, parent_window: Tk) -> str:
    authority = f"https://login.microsoftonline.com/{tenant_id}"
    if auth_mode == "AppSecret":
        app = msal.ConfidentialClientApplication(client_id=client_id, authority=authority, client_credential=client_secret)
        result = app.acquire_token_for_client(scopes=[scope])
        if "access_token" not in result:
            raise RuntimeError(result.get("error_description", "Failed to acquire app token"))
        return result["access_token"]

    app = msal.PublicClientApplication(client_id=client_id, authority=authority)
    flow = app.initiate_device_flow(scopes=[scope])
    if "user_code" not in flow:
        raise RuntimeError("Failed to initiate device flow")
    msg = flow.get("message", "Complete device code sign-in.")
    verification_uri = flow.get("verification_uri", "https://login.microsoft.com/device")
    verification_uri_complete = flow.get("verification_uri_complete")
    user_code = flow.get("user_code", "")
    try:
        if user_code:
            parent_window.clipboard_clear()
            parent_window.clipboard_append(user_code)
            parent_window.update()
    except Exception:
        pass
    try:
        webbrowser.open(verification_uri_complete or verification_uri)
    except Exception:
        pass
    hint = f"{msg}\n\nThe device code has been copied to your clipboard."
    if verification_uri_complete:
        hint += "\nA browser tab has also been opened with the code pre-filled when supported."
    else:
        hint += "\nA browser tab has been opened at the device sign-in page."
    messagebox.showinfo("Device Sign-in Required", hint, parent=parent_window)
    result = app.acquire_token_by_device_flow(flow)
    if "access_token" not in result:
        raise RuntimeError(result.get("error_description", "Failed to acquire delegated token"))
    return result["access_token"]


def call_api(url: str, method: str, token: str, body: dict | None) -> dict:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    kwargs = {"headers": headers, "timeout": 120}
    if body is not None and method != "GET":
        kwargs["json"] = body
    resp = requests.request(method=method, url=url, **kwargs)
    text = resp.text
    return {"ok": resp.ok, "statusCode": resp.status_code, "body": text}


def pretty_json_or_text(raw: str) -> str:
    try:
        return json.dumps(json.loads(raw), indent=2)
    except Exception:
        return raw


def write_outputs(output_dir: Path, envelope: dict) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    json_path = output_dir / f"run-{ts}.json"
    html_path = output_dir / f"run-{ts}.html"
    history_path = output_dir / "history.jsonl"

    json_path.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    body_pretty = pretty_json_or_text(envelope["response"]["body"])
    status_color = "#7ee787" if envelope["response"]["ok"] else "#ff7b72"
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>API Verifier Run</title>
<style>
body{{font-family:Segoe UI,Arial;margin:24px;background:#0b1020;color:#e7ecff}}
.card{{background:#111a33;border:1px solid #2a3966;border-radius:12px;padding:14px;margin-bottom:14px}}
table{{border-collapse:collapse;width:100%}}td{{padding:8px;border-bottom:1px solid #223258}}td:first-child{{width:180px;color:#9db2e8}}
pre{{background:#0a1328;border:1px solid #24365f;border-radius:10px;padding:12px;overflow:auto}}
</style></head><body>
<h1>Reporting API Verifier - Run Result</h1>
<div class="card"><table>
<tr><td>Timestamp</td><td>{envelope["timestamp"]}</td></tr>
<tr><td>Auth mode</td><td>{envelope["authMode"]}</td></tr>
<tr><td>Preset</td><td>{envelope.get("preset")}</td></tr>
<tr><td>Method</td><td>{envelope["method"]}</td></tr>
<tr><td>Scope</td><td>{envelope["scope"]}</td></tr>
<tr><td>Status</td><td style="color:{status_color}">{envelope["response"]["statusCode"]} (ok={envelope["response"]["ok"]})</td></tr>
<tr><td>URL</td><td><code>{envelope["url"]}</code></td></tr>
</table></div>
<div class="card"><h2>Response Body</h2><pre>{body_pretty}</pre></div>
</body></html>"""
    html_path.write_text(html, encoding="utf-8")
    history_path.open("a", encoding="utf-8").write(json.dumps({
        "timestamp": envelope["timestamp"],
        "preset": envelope.get("preset"),
        "method": envelope["method"],
        "scope": envelope["scope"],
        "statusCode": envelope["response"]["statusCode"],
        "ok": envelope["response"]["ok"],
        "url": envelope["url"],
        "jsonFile": str(json_path),
        "htmlFile": str(html_path),
    }) + "\n")
    return json_path, html_path


def main():
    args = parse_args()
    if args.list_presets:
        print(json.dumps(PRESETS, indent=2))
        return

    repo_root = Path(__file__).resolve().parents[2]
    config = load_config(args.config, repo_root)
    cred_path = args.credentials or config.get("credentialsFile") or "apps/reporting-api-verifier-python/credentials.local.json"
    credentials = {}
    resolved_cred_path = None
    try:
        credentials, resolved_cred_path = load_json_file(str(cred_path), repo_root, "Credentials")
    except FileNotFoundError:
        credentials = {}
        resolved_cred_path = None

    tenant_id = str(credentials.get("tenantId", "") or config.get("tenantId", "")).strip()
    client_id = str(credentials.get("clientId", "") or config.get("clientId", "")).strip()
    client_secret = str(credentials.get("clientSecret", "") or config.get("clientSecret", "") or "")
    if not tenant_id or not client_id:
        raise RuntimeError("tenantId and clientId are required in credentials JSON")

    base_vars = {}
    if config.get("subscriptionId"):
        base_vars["subscriptionId"] = config["subscriptionId"]
    if config.get("dataverseUrl"):
        base_vars["dataverseUrl"] = str(config["dataverseUrl"]).rstrip("/")

    output_dir = Path(config.get("outputDir", "apps/reporting-api-verifier-python/output"))
    if not output_dir.is_absolute():
        output_dir = (repo_root / output_dir).resolve()

    root = Tk()
    root.title("Reporting API Verifier (Python GUI)")
    root.geometry("1280x860")

    Label(root, text=f"Config: {Path(args.config)}").place(x=12, y=10)
    cred_label = f"Credentials: {resolved_cred_path}" if resolved_cred_path else "Credentials: not found (using config.local.json values)"
    Label(root, text=cred_label).place(x=12, y=28)

    Label(root, text="Auth").place(x=12, y=60)
    auth_var = StringVar(value=config.get("defaultAuthMode", "AppSecret"))
    auth_combo = ttk.Combobox(root, values=["AppSecret", "DelegatedDeviceCode"], textvariable=auth_var, state="readonly", width=22)
    auth_combo.place(x=55, y=58)

    Label(root, text="Preset").place(x=260, y=60)
    preset_var = StringVar(value="custom")
    preset_combo = ttk.Combobox(root, values=["custom"] + [p["name"] for p in PRESETS], textvariable=preset_var, state="readonly", width=46)
    preset_combo.place(x=305, y=58)

    Label(root, text="Method").place(x=735, y=60)
    method_var = StringVar(value="GET")
    method_combo = ttk.Combobox(root, values=["GET", "POST", "PATCH", "PUT", "DELETE"], textvariable=method_var, state="readonly", width=10)
    method_combo.place(x=790, y=58)

    Label(root, text="Scope").place(x=890, y=60)
    scope_var = StringVar(value="graph")
    scope_combo = ttk.Combobox(root, values=["graph", "arm", "dataverse"], textvariable=scope_var, state="readonly", width=12)
    scope_combo.place(x=940, y=58)

    Label(root, text="URL").place(x=12, y=93)
    url_entry = Entry(root, width=175)
    url_entry.place(x=55, y=92)

    Label(root, text="Variables JSON").place(x=12, y=125)
    vars_text = Text(root, width=74, height=8)
    vars_text.place(x=12, y=145)
    vars_text.insert("1.0", json.dumps(base_vars, indent=2))

    Label(root, text="Body JSON").place(x=640, y=125)
    body_text = Text(root, width=74, height=8)
    body_text.place(x=640, y=145)

    status_var = StringVar(value="Status: idle")
    Label(root, textvariable=status_var).place(x=12, y=295)

    output_text = Text(root, width=180, height=32)
    output_text.place(x=12, y=320)

    def on_preset_change(_evt=None):
        name = preset_var.get()
        if name == "custom":
            return
        p = next((x for x in PRESETS if x["name"] == name), None)
        if not p:
            return
        method_var.set(p["method"])
        scope_var.set(p["scope"])
        url_entry.delete(0, END)
        url_entry.insert(0, p["url"])
        body_text.delete("1.0", END)
        if "defaultBody" in p:
            body_text.insert("1.0", json.dumps(p["defaultBody"], indent=2))

    preset_combo.bind("<<ComboboxSelected>>", on_preset_change)

    def open_output_folder():
        output_dir.mkdir(parents=True, exist_ok=True)
        os.startfile(str(output_dir))  # type: ignore[attr-defined]

    def run_request():
        try:
            status_var.set("Status: running...")
            root.update_idletasks()

            auth_mode = auth_var.get().strip()
            scope_kind = scope_var.get().strip()
            method = method_var.get().strip().upper()
            preset_name = preset_var.get().strip()
            template = url_entry.get().strip()
            if not template:
                raise RuntimeError("URL is required")

            vars_obj = base_vars.copy()
            user_vars_raw = vars_text.get("1.0", END).strip()
            if user_vars_raw:
                vars_obj.update(json.loads(user_vars_raw))
            for sensitive_key in ("tenantId", "clientId", "clientSecret"):
                vars_obj.pop(sensitive_key, None)

            effective_tenant_id = tenant_id
            effective_client_id = client_id
            effective_client_secret = str(client_secret or "").strip()

            if not effective_tenant_id or effective_tenant_id.lower() == "your-tenant-id-guid":
                raise RuntimeError("tenantId is missing or placeholder. Update credentials.local.json.")
            if not effective_client_id or effective_client_id.lower() == "your-app-client-id-guid":
                raise RuntimeError("clientId is missing or placeholder. Update credentials.local.json.")
            if auth_mode == "AppSecret":
                if not effective_client_secret or effective_client_secret.lower() == "your-client-secret":
                    raise RuntimeError("clientSecret is missing or placeholder for AppSecret mode in credentials.local.json.")

            resolved_url = resolve_template(template, vars_obj)
            scope = get_scope(scope_kind, auth_mode, vars_obj.get("dataverseUrl"))
            token = acquire_token(
                auth_mode,
                effective_tenant_id,
                effective_client_id,
                effective_client_secret,
                scope,
                root,
            )

            body_raw = body_text.get("1.0", END).strip()
            body_obj = json.loads(body_raw) if body_raw else None
            response = call_api(resolved_url, method, token, body_obj)

            envelope = {
                "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
                "preset": None if preset_name == "custom" else preset_name,
                "authMode": auth_mode,
                "method": method,
                "scope": scope_kind,
                "url": resolved_url,
                "variables": vars_obj,
                "response": response,
            }
            json_path, html_path = write_outputs(output_dir, envelope)
            output_text.delete("1.0", END)
            output_text.insert("1.0", json.dumps(envelope, indent=2))
            status_var.set(f"Status: done | HTTP {response['statusCode']} | ok={response['ok']} | json={json_path.name} | html={html_path.name}")
        except Exception as ex:
            status_var.set("Status: error")
            output_text.delete("1.0", END)
            output_text.insert("1.0", str(ex))
            messagebox.showerror("Execution Error", str(ex), parent=root)

    def run_request_async():
        threading.Thread(target=run_request, daemon=True).start()

    Button(root, text="Run", command=run_request_async, width=10).place(x=1070, y=56)
    Button(root, text="Open Output", command=open_output_folder, width=12).place(x=1160, y=56)

    root.mainloop()


if __name__ == "__main__":
    main()
