"""Refresh fixtures.json from live-footballontv.com team pages.
If a page fails or yields nothing, that team's existing fixtures are kept."""
import json, re, sys, datetime as dt
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

BASE = "https://www.live-footballontv.com/"
# team key -> page. Check the two marked (?) open in a browser; fix the slug if needed.
PAGES = {
    "aw": "arsenal-women-on-tv.html",
    "li": "england-women-on-tv.html",
    "mc": "manchester-city-on-tv.html",   # (?)
    "en": "england-on-tv.html",           # (?)
    "mu": "manchester-united-women-on-tv.html",  # (?)
    "cw": "chelsea-women-on-tv.html",
}
LON = ZoneInfo("Europe/London")
DATE = re.compile(r"^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$")
TIME = re.compile(r"^(\d{1,2}:\d{2}|TBC|TBA)$", re.I)
MATCH = re.compile(r"^(.+?)\s+v\s+(.+)$")
CHAN = re.compile(r"^(BBC (?:One|Two|Three|Four|Sport Web|iPlayer)|BBC Red Button|ITV[1-4X]?|S4C|Sky Sports[\w \+]*|Sky Showcase|Sky Mix|WSL YouTube|Sky Sports Ultra HDR|TNT Sports[\w ]*|HBO Max|Prime Video|Amazon Prime Video|DAZN|Disney\+|Premier Sports[\w ]*|Channel 4|Channel 5|W Network|ESPN|YouTube|Viaplay[\w ]*)$", re.I)
FREE_MAP = {"BBC Sport Web": "BBC iPlayer", "BBC Sport Website": "BBC iPlayer"}
SKIP = {"Sky Mix", "Sky Sports Ultra HDR"}
TEAM = {
    "aw": lambda h, a: "Arsenal" in h + a,
    "li": lambda h, a: "England" in h + a and not re.search(r"U\d\d", h + a),
    "mc": lambda h, a: "Manchester City" in h + a or "Man City" in h + a,
    "mu": lambda h, a: "Manchester United" in h + a or "Man Utd" in h + a,
    "cw": lambda h, a: "Chelsea" in h + a,
    "en": lambda h, a: "England" in h + a and "Women" not in h + a and not re.search(r"U\d\d", h + a),
}

def parse(text, key):
    out, day = [], None
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    i = 0
    while i < len(lines):
        m = DATE.match(lines[i])
        if m:
            try:
                day = dt.datetime.strptime(f"{m[1]} {m[2][:3]} {m[3]}", "%d %b %Y").date()
            except ValueError:
                day = None
            i += 1; continue
        if day and TIME.match(lines[i]) and i + 1 < len(lines):
            t, mm = lines[i], MATCH.match(lines[i + 1])
            if mm and TEAM[key](mm[1], mm[2]):
                j, comp, chans = i + 2, "", []
                if j < len(lines) and not CHAN.match(lines[j]) and not TIME.match(lines[j]) and not DATE.match(lines[j]):
                    comp = lines[j]; j += 1
                while j < len(lines) and CHAN.match(lines[j]):
                    c = FREE_MAP.get(lines[j], lines[j])
                    if c not in chans and c not in SKIP: chans.append(c)
                    j += 1
                tbc = not re.match(r"\d", t)
                hh, mi = (12, 0) if tbc else map(int, t.split(":"))
                iso = dt.datetime(day.year, day.month, day.day, hh, mi, tzinfo=LON).isoformat()
                out.append({"t": key, "iso": iso, "comp": comp, "h": mm[1].strip(), "a": mm[2].strip(),
                            "ch": chans, "note": "Kick-off time to be confirmed" if tbc else ("" if chans else "Channel to be confirmed"),
                            "tbc": tbc})
        i += 1
    return out

def main():
    try: old = json.load(open("fixtures.json"))["fixtures"]
    except Exception: old = []
    new, now = [], dt.datetime.now(LON)
    for key, slug in PAGES.items():
        try:
            r = requests.get(BASE + slug, timeout=30, headers={"User-Agent": "Mozilla/5.0 fixtures-page"})
            r.raise_for_status()
            got = parse(BeautifulSoup(r.text, "html.parser").get_text("\n"), key)
        except Exception as e:
            print(f"{key}: failed ({e})", file=sys.stderr); got = []
        got = [g for g in got if dt.datetime.fromisoformat(g["iso"]) > now - dt.timedelta(hours=3)]
        print(f"{key}: {len(got)} fixtures")
        new += got or [f for f in old if f["t"] == key]
    new.sort(key=lambda f: f["iso"])
    json.dump({"updated": now.strftime("%-d %b %Y, %H:%M"), "fixtures": new}, open("fixtures.json", "w"), indent=1, ensure_ascii=False)

if __name__ == "__main__":
    main()
