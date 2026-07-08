#!/usr/bin/env python3
"""Pre-production connectivity: health, DB, tenant/platform auth, SMTP/AWS env, storage API."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")


def load_backend_env() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(root, "backend", ".env")
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            os.environ.setdefault(key, val)


load_backend_env()
TENANT_LOGIN = {
    "email": os.environ.get("HRM_EMAIL", "info@retaildaddy.in"),
    "password": os.environ.get("HRM_PASSWORD", "password"),
    "org_slug": os.environ.get("HRM_ORG_SLUG", "mashuptech"),
}
PLATFORM_LOGIN = {
    "email": os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in"),
    "password": os.environ.get("PLATFORM_ADMIN_PASSWORD", "retaildaddy@0123"),
}


@dataclass
class Suite:
    results: list[tuple[str, str, bool, str]] = field(default_factory=list)

    def record(self, case_id: str, name: str, passed: bool, detail: str = "") -> None:
        self.results.append((case_id, name, passed, detail))
        mark = "PASS" if passed else "FAIL"
        print(f"  [{mark}] {case_id}: {name}" + (f" | {detail}" if detail else ""))

    def summary(self) -> int:
        passed = sum(1 for *_, ok, _ in self.results if ok)
        total = len(self.results)
        print("\n" + "=" * 60)
        print(f"PRE-PRODUCTION CONNECTIVITY: {passed}/{total} passed")
        for cid, name, ok, detail in self.results:
            if not ok:
                print(f"  - {cid}: {name} | {detail}")
        return 0 if passed == total else 1


def http(method: str, url: str, data: dict | None = None, headers: dict | None = None) -> tuple[int, dict | str | None]:
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        hdrs["Content-Type"] = "application/json"
        body = json.dumps(data).encode()
    req = urllib.request.Request(url, body, hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode(errors="replace")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def env_present(*keys: str) -> tuple[bool, str]:
    missing = [k for k in keys if not os.environ.get(k)]
    return len(missing) == 0, ", ".join(missing) if missing else "ok"


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("PRE-PRODUCTION CONNECTIVITY SUITE")
    print("=" * 60)

    code, health = http("GET", f"{API}/api/health")
    db_ok = isinstance(health, dict) and health.get("database", {}).get("ok") is True
    suite.record("CONN-01", "API health endpoint", code == 200, f"HTTP {code}")
    suite.record("CONN-02", "Database backend healthy", db_ok, str(health.get("database") if isinstance(health, dict) else health))

    code, login = http("POST", f"{API}/api/auth/login", TENANT_LOGIN)
    token = login.get("data", {}).get("token") if isinstance(login, dict) else None
    suite.record("CONN-03", "Tenant login interconnection", code == 200 and bool(token), f"HTTP {code}")

    code, plogin = http("POST", f"{API}/api/platform/auth/login", PLATFORM_LOGIN)
    ptok = plogin.get("data", {}).get("token") if isinstance(plogin, dict) else None
    suite.record("CONN-04", "Platform admin login", code == 200 and bool(ptok), f"HTTP {code}")

    if token:
        auth = {"Authorization": f"Bearer {token}"}
        code, me = http("GET", f"{API}/api/auth/me", headers=auth)
        org_id = None
        if isinstance(me, dict):
            data = me.get("data") or me
            user = data.get("user") if isinstance(data.get("user"), dict) else data
            org_id = user.get("organization_id") or (data.get("organization") or {}).get("id")
        suite.record("CONN-05", "Tenant JWT /auth/me", code == 200 and org_id is not None, f"org_id={org_id}")

        code, settings = http("GET", f"{API}/api/admin/settings/app", headers=auth)
        suite.record("CONN-06", "Tenant settings API", code == 200, f"HTTP {code}")

        code, centers = http("GET", f"{API}/api/admin/settings/centers", headers=auth)
        count = len(centers.get("data", [])) if isinstance(centers, dict) else 0
        suite.record("CONN-07", "Centers API (branch/tenant)", code == 200, f"centers={count}")

    smtp_ok, smtp_detail = env_present("SMTP_HOST", "SMTP_USER", "SMTP_PASS")
    suite.record("CONN-08", "SMTP mail env configured", smtp_ok, smtp_detail)

    aws_ok, aws_detail = env_present("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET")
    suite.record("CONN-09", "AWS S3 env configured", aws_ok, aws_detail)

    cf_ok = bool(os.environ.get("CLOUDFRONT_URL"))
    suite.record("CONN-10", "CloudFront URL configured", cf_ok, os.environ.get("CLOUDFRONT_URL", "missing"))

    # Optional live S3 bucket check when AWS CLI is available
    bucket = os.environ.get("AWS_S3_BUCKET", "")
    region = os.environ.get("AWS_REGION", "ap-south-1")
    if bucket and shutil_which("aws"):
        try:
            proc = subprocess.run(
                ["aws", "s3", "ls", f"s3://{bucket}", "--region", region],
                capture_output=True,
                text=True,
                timeout=30,
            )
            suite.record(
                "CONN-11",
                "AWS S3 bucket reachable",
                proc.returncode == 0,
                proc.stderr.strip()[:120] or "listed",
            )
        except Exception as exc:
            suite.record("CONN-11", "AWS S3 bucket reachable", False, str(exc))
    else:
        suite.record("CONN-11", "AWS S3 bucket reachable", aws_ok, "SKIP: aws cli or bucket unset")

    # Biometric port from same host
    bio_port = os.environ.get("BIOMETRIC_PORT", "7788")
    host = API.replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
    try:
        bio_url = f"http://{host}:{bio_port}/"
        code_bio, _ = http("GET", bio_url)
        suite.record("CONN-12", "Biometric HTTP listener", code_bio in (200, 404, 405), f"HTTP {code_bio}")
    except Exception as exc:
        suite.record("CONN-12", "Biometric HTTP listener", False, str(exc))

    return suite.summary()


def shutil_which(cmd: str) -> bool:
    from shutil import which

    return which(cmd) is not None


if __name__ == "__main__":
    sys.exit(main())
