"""Download team crests from football-logos.cc into logos/teams/<key>.png.
Existing files are kept if a download fails. Credit: football-logos.cc"""
import re, sys, pathlib, requests

BASE = "https://football-logos.cc"
H = {"User-Agent": "Mozilla/5.0 fixtures-page"}
OUT = pathlib.Path("logos/teams")
CLUBS = {  # key -> page on football-logos.cc
    "mc": "/england/manchester-city/",
    "aw": "/england/arsenal/",
    "mu": "/england/manchester-united/",
    "cw": "/england/chelsea/",
}
ASSET = re.compile(r'https://assets\.football-logos\.cc/logos/[a-z0-9-]+/(?:256x256|512x512|700x700)/([a-z0-9-]+)\.[0-9a-f]{8}\.png')

def get(url):
    r = requests.get(url, headers=H, timeout=30)
    r.raise_for_status()
    return r

def asset_for(page):
    slug = page.strip("/").split("/")[-1]
    for m in ASSET.finditer(get(BASE + page).text):
        if m.group(1) == slug:      # plain crest only, not the monochrome variants
            return m.group(0)
    raise ValueError("no logo found on " + page)

def england_page():
    html = get(BASE + "/national-teams/").text
    m = re.search(r'href="(?:https://football-logos\.cc)?(/[a-z0-9-]+/england/)"', html)
    if not m:
        raise ValueError("England page not found")
    return m.group(1)

def save(keys, page):
    data = get(asset_for(page)).content
    for k in keys:
        (OUT / f"{k}.png").write_bytes(data)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [([k], p) for k, p in CLUBS.items()]
    try:
        jobs.append((["li", "en"], england_page()))
    except Exception as e:
        print("england: failed", e, file=sys.stderr)
    for keys, page in jobs:
        try:
            save(keys, page); print("ok", keys, page)
        except Exception as e:
            print("failed", keys, page, e, file=sys.stderr)

if __name__ == "__main__":
    main()
