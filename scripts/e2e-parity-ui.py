"""Run after e2e-publishing-automation-parity.ts, against an isolated dev server only.
Requires Python Playwright + Chromium. Never publishes or sends messages.
Set CUE_TEST_PSQL when PostgreSQL is installed somewhere else.
"""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("CUE_TEST_APP_URL", "http://localhost:3219")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1"), "Local server only"
DB = os.environ.get("CUE_TEST_DB", "cue_parity_test")
assert "test" in DB, "Throwaway test database only"
PSQL = os.environ.get("CUE_TEST_PSQL", r"C:\Program Files\PostgreSQL\17\bin\psql.exe")
OUT = Path(os.environ.get("TEMP", "/tmp")) / "cue-parity-20261117"
OUT.mkdir(exist_ok=True)


def sql(query):
    return subprocess.check_output([PSQL, "-h", "127.0.0.1", "-p", os.environ.get("CUE_TEST_DB_PORT", "55439"), "-U", "postgres", "-d", DB, "-At", "-c", query], text=True).strip()


email = sql('''SELECT email FROM "User" WHERE email LIKE 'parity-%' ORDER BY "createdAt" DESC LIMIT 1''')
assert email, "Run the parity fixture suite first"
draft = sql('''SELECT id FROM "Post" WHERE body = 'UI preview fixture' ORDER BY "createdAt" DESC LIMIT 1''')
assert draft
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_cookies([
        {"name": "cue_dev_user", "value": email, "url": BASE},
        {"name": "cue_tz", "value": "Asia/Kolkata", "url": BASE},
    ])
    # No social API, analytics or remote media requests from the browser.
    context.route("**/*", lambda route: route.continue_() if urlparse(route.request.url).hostname in ("localhost", "127.0.0.1") or route.request.url.startswith("data:") else route.abort())
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(BASE + "/automations", wait_until="networkidle")
    expect(page.get_by_role("heading", name="Results from the last 7 days")).to_be_visible()
    page.get_by_role("button", name="30 days", exact=True).click()
    expect(page.get_by_role("heading", name="Results from the last 30 days")).to_be_visible()
    page.get_by_text("Start with a template", exact=True).click()
    expect(page.get_by_role("button", name="Send my free guide")).to_be_visible()
    page.screenshot(path=str(OUT / "parity-dashboard.png"))
    page.get_by_role("button", name="Opening DM and tracking", exact=True).click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible()
    page.get_by_text("Matching, campaign & tracking", exact=True).click()
    page.get_by_label("Starts at", exact=True).fill("2030-01-02T10:30")
    page.get_by_label("Ends at", exact=True).fill("2030-01-03T10:30")
    page.get_by_label("Exclude keywords", exact=True).fill("not interested, already bought")
    page.get_by_label("Priority", exact=True).fill("12")
    page.get_by_label("Tag matching leads", exact=True).fill("launch, reviewed")
    page.get_by_label("Priority", exact=True).click()  # Commit the last onBlur field.
    page.screenshot(path=str(OUT / "parity-editor-desktop.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.get_by_role("button", name="Save changes", exact=True).scroll_into_view_if_needed()
    expect(page.get_by_role("button", name="Save changes", exact=True)).to_be_in_viewport()
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
    page.screenshot(path=str(OUT / "parity-editor-mobile.png"))
    page.get_by_role("button", name="Save changes", exact=True).click()
    expect(dialog).not_to_be_visible()
    saved = sql('''SELECT json_build_object('startsAt', "startsAt", 'settings', settings) FROM "AutomationRule" WHERE name = 'Opening DM and tracking' ORDER BY "createdAt" DESC LIMIT 1''')
    saved = json.loads(saved)
    assert saved["startsAt"].startswith("2030-01-02T05:00:00"), saved
    assert saved["settings"]["priority"] == 12
    assert "reviewed" in saved["settings"]["leadTags"]
    assert "already bought" in saved["settings"]["excludedKeywords"]
    print("ok campaign date, matching and tags saved from mobile in the viewer's time zone")

    page.set_viewport_size({"width": 1440, "height": 1000})
    page.goto(BASE + "/automations?tab=leads", wait_until="networkidle")
    page.get_by_role("button", name="@reader_opening", exact=True).click()
    page.get_by_label("Team notes", exact=True).fill("=UI check: follow up personally")
    page.get_by_label("Tags", exact=True).fill("customer, reviewed")
    page.get_by_role("switch", name="Pause automation for this person", exact=True).check()
    page.get_by_role("button", name="Save changes", exact=True).click()
    expect(page.get_by_role("dialog")).not_to_be_visible()
    page.get_by_label("Search leads").fill("customer")
    page.get_by_role("button", name="Search all leads", exact=True).click()
    expect(page.get_by_role("button", name="@reader_opening", exact=True)).to_be_visible()
    export = page.request.get(BASE + "/api/automations/leads")
    assert export.status == 200
    assert '"Tags","Notes","Automation paused"' in export.text()
    assert "'=UI check" in export.text(), "CSV formula safety"
    print("ok lead notes, tags, pause, server search and CSV export")

    page.goto(BASE + "/automations?tab=activity&activityFilter=failed", wait_until="networkidle")
    expect(page.get_by_role("button", name="Retry unsent replies").first).to_be_visible()
    page.goto(BASE + "/composer?edit=" + draft, wait_until="networkidle")
    page.get_by_text("Instagram settings", exact=False).first.click()
    page.get_by_text("YouTube audience & distribution", exact=True).click()
    page.get_by_text("LinkedIn settings", exact=True).click()
    page.get_by_label("Trial Reel", exact=True).select_option("MANUAL")
    page.get_by_label("YouTube audience", exact=True).select_option("kids")
    page.get_by_role("switch", name="Disclose AI-generated content", exact=True).check()
    page.get_by_label("YouTube audience", exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / "parity-composer-desktop.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.get_by_label("YouTube audience", exact=True).scroll_into_view_if_needed()
    expect(page.get_by_label("YouTube audience", exact=True)).to_be_in_viewport()
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
    page.screenshot(path=str(OUT / "parity-composer-mobile.png"))
    print("ok composer platform controls on desktop and mobile")
    assert not errors, errors
    print("All browser checks passed; no page errors. Screenshots:", OUT)
    browser.close()
