import json
import time
import urllib.error
import urllib.request

API = "http://127.0.0.1:3001/api"


def login():
    req = urllib.request.Request(
        f"{API}/auth/login",
        data=json.dumps(
            {
                "email": "info@retaildaddy.in",
                "password": "Guru!1234",
                "org_slug": "mashuptech",
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    data = json.loads(urllib.request.urlopen(req).read())
    return data["data"]["token"]


def get(token, path):
    req = urllib.request.Request(
        f"{API}{path}",
        headers={"Authorization": f"Bearer {token}"},
    )
    return json.loads(urllib.request.urlopen(req).read())


def post(token, path, body):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def main():
    token = login()
    suffix = str(int(time.time()))[-6:]
    centers = get(token, "/admin/settings/centers")["data"]
    cid = centers[0]["id"]
    tests = [
        ("department", "/admin/departments", {"name": f"demo{suffix}", "center_id": cid, "description": "df", "is_active": True}),
        ("designation", "/admin/designations", {"name": f"Desg{suffix}", "is_active": True}),
        ("center", "/admin/settings/centers", {"name": f"Branch{suffix}", "code": f"BR{suffix}", "is_active": True}),
        ("holiday", "/admin/holidays", {"name": f"Hol{suffix}", "date": "2026-12-25", "description": "x", "is_paid": True}),
        ("role", "/admin/roles", {"name": f"Role{suffix}", "description": "test"}),
        ("user", "/admin/users", {"name": "Test", "email": f"u{suffix}@test.com", "password": "LocalTest123!", "password_confirmation": "LocalTest123!", "status": "active"}),
    ]
    failed = 0
    for label, path, body in tests:
        status, data = post(token, path, body)
        ok = status in (200, 201) and data.get("success")
        print(f"{'PASS' if ok else 'FAIL'} {label} -> {status} {data.get('message', '')}")
        if not ok:
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
