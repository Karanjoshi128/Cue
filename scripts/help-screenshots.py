"""
Takes the help centre's screenshots from the demo workspace and draws the
numbered boxes. Pictures go to public/help/<id>.png; their sizes go to
src/lib/help/shots.generated.ts, which is what makes a step show its picture.

LOCAL ONLY, against demo data, never production:
  1. Throwaway Postgres + `pnpm tsx --env-file=.env scripts/help-demo-seed.ts`
     (the .env must point at that local database).
  2. A dev server with dev sign-in (empty NEXT_PUBLIC_SUPABASE_URL) and
     placeholder LINKEDIN_PAGES_CLIENT_ID / _SECRET so the Page menu shows:
       pnpm next dev -p 3320
  3. pnpm help:shots            (all)   or   pnpm help:shots <id> [<id>...]

Needs Python Playwright with Chromium (pip install playwright; playwright install chromium).
"""

import json
import os
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("HELP_BASE", "http://localhost:3320")
DEMO_USER = "maya@northwind.example"
OUT_DIR = os.path.join("public", "help")
MANIFEST = os.path.join("src", "lib", "help", "shots.generated.ts")
MARGIN = 16
SIZES = {"desktop": (1440, 900), "mobile": (390, 844)}
# Cropped pictures use a taller window so a whole section fits on screen.
CROP_HEIGHT = {"desktop": 1500, "mobile": 1400}

# Hidden in every picture: dev-only overlays and seasonal decoration.
HIDE_CSS = """
nextjs-portal, [data-nextjs-toast], [data-next-badge-root], .festive-lights { display: none !important; }
*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
"""

DRAW_JS = """
(boxes) => {
  document.querySelectorAll('[data-help-mark]').forEach((n) => n.remove());
  boxes.forEach((b, i) => {
    const box = document.createElement('div');
    box.setAttribute('data-help-mark', '');
    Object.assign(box.style, {
      position: 'fixed', left: (b.x - 4) + 'px', top: (b.y - 4) + 'px',
      width: (b.width + 8) + 'px', height: (b.height + 8) + 'px',
      border: '2.5px solid #e8590c', borderRadius: '10px', zIndex: 2147483646,
      pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(232,89,12,0.18)',
    });
    const tag = document.createElement('div');
    tag.setAttribute('data-help-mark', '');
    tag.textContent = String(i + 1);
    Object.assign(tag.style, {
      position: 'fixed', left: Math.max(2, b.x - 15) + 'px', top: Math.max(2, b.y - 15) + 'px',
      width: '22px', height: '22px', borderRadius: '999px', background: '#e8590c',
      color: '#fff', font: '700 12px/22px system-ui, sans-serif', textAlign: 'center',
      zIndex: 2147483647, pointerEvents: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    });
    document.body.append(box, tag);
  });
}
"""


def locate(page, t):
    if "role" in t:
        kw = {}
        if "name" in t:
            kw["name"] = t["name"]
            kw["exact"] = t.get("exact", False)
        loc = page.get_by_role(t["role"], **kw)
    elif "label" in t:
        loc = page.get_by_label(t["label"], exact=t.get("exact", False))
    elif "text" in t:
        loc = page.get_by_text(t["text"], exact=t.get("exact", False))
    elif "placeholder" in t:
        loc = page.get_by_placeholder(t["placeholder"])
    else:
        loc = page.locator(t["css"])
    nth = t.get("nth", 0)
    return loc.last if nth == -1 else loc.nth(nth)


def act(page, a):
    if "click" in a:
        locate(page, a["click"]).click()
    elif "fill" in a:
        locate(page, a["fill"]).fill(a["value"])
    elif "hover" in a:
        locate(page, a["hover"]).hover()
    elif "press" in a:
        page.keyboard.press(a["press"])
    elif "waitFor" in a:
        locate(page, a["waitFor"]).wait_for(timeout=20000)
    elif "wait" in a:
        page.wait_for_timeout(a["wait"])
    page.wait_for_timeout(250)


def view_box(loc):
    """Bounding box in viewport coordinates. The app scrolls inside #app-panel,
    not the window, so everything here works in viewport terms."""
    b = loc.bounding_box()
    if not b:
        raise RuntimeError("target isn't visible")
    return b


def take(browser, shot):
    device = shot.get("device", "desktop")
    w, h = SIZES[device]
    if "crop" in shot:
        h = CROP_HEIGHT[device]
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, color_scheme="light")
    ctx.add_cookies(
        [
            {"name": "cue_dev_user", "value": DEMO_USER, "url": BASE},
            {"name": "cue_tz", "value": "Asia%2FKolkata", "url": BASE},
        ]
    )
    ctx.add_init_script("try { localStorage.setItem('theme', 'light') } catch {}")
    page = ctx.new_page()
    page.goto(BASE + shot["path"], wait_until="networkidle", timeout=180000)
    page.add_style_tag(content=HIDE_CSS)
    page.wait_for_timeout(600)
    for a in shot.get("actions", []):
        act(page, a)
    page.wait_for_timeout(400)

    path = os.path.join(OUT_DIR, shot["id"] + ".png")
    crop = locate(page, shot["crop"]) if "crop" in shot else None
    if crop:
        # Bring the cropped area to the top of whatever scrolls (window or panel).
        crop.evaluate("(el) => el.scrollIntoView({ block: 'start' })")
        page.wait_for_timeout(250)
        crop.evaluate(
            "(el) => { const r = el.getBoundingClientRect(); if (r.top < 24) (document.getElementById('app-panel') || document.scrollingElement).scrollBy(0, r.top - 24) }"
        )
        page.wait_for_timeout(250)

    boxes = [view_box(locate(page, t)) for t in shot.get("highlight", [])]
    if boxes:
        page.evaluate(DRAW_JS, boxes)

    if crop:
        c = view_box(crop)
        x0, y0 = max(0, c["x"] - MARGIN), max(0, c["y"] - MARGIN)
        clip = {
            "x": x0,
            "y": y0,
            "width": min(w - x0, c["width"] + 2 * MARGIN),
            "height": min(h - y0, c["height"] + 2 * MARGIN),
        }
        page.screenshot(path=path, clip=clip)
        size = (round(clip["width"]), round(clip["height"]))
    else:
        page.screenshot(path=path)
        size = (w, h)
    ctx.close()
    return size


def main():
    only = set(sys.argv[1:])
    exported = subprocess.run(
        "pnpm -s exec tsx scripts/help-shots-export.ts", shell=True, capture_output=True, text=True, check=True
    ).stdout
    shots = [s for s in json.loads(exported) if not only or s["id"] in only]
    os.makedirs(OUT_DIR, exist_ok=True)

    sizes = {}
    if os.path.exists(MANIFEST):  # keep earlier pictures when only some are retaken
        import re

        for m in re.finditer(r'"([a-z0-9-]+)": \{ width: (\d+), height: (\d+) \}', open(MANIFEST, encoding="utf-8").read()):
            sizes[m.group(1)] = (int(m.group(2)), int(m.group(3)))

    failed = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for shot in shots:
            try:
                sizes[shot["id"]] = take(browser, shot)
                print(f"ok   {shot['id']}")
            except Exception as e:  # keep going; report at the end
                failed.append(shot["id"])
                print(f"FAIL {shot['id']} ({shot['guide']}): {str(e).splitlines()[0]}")
        browser.close()

    known = {s["id"] for s in json.loads(exported)}
    lines = [
        "// Written by scripts/help-screenshots.py. Do not edit by hand.",
        "// Each entry is a picture saved at public/help/<id>.png; a step only shows",
        "// its picture once it's listed here, so a missing file never breaks a page.",
        "",
        "export const HELP_SHOTS: Record<string, { width: number; height: number }> = {",
    ]
    for sid in sorted(k for k in sizes if k in known and os.path.exists(os.path.join(OUT_DIR, k + ".png"))):
        w, h = sizes[sid]
        lines.append(f'  "{sid}": {{ width: {w}, height: {h} }},')
    lines.append("};")
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\n{len(shots) - len(failed)} taken, {len(failed)} failed." + (f" Failed: {', '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
