"""Refresh fixtures.json from live-footballontv.com listings.
Each team has a list of pages to try; the first that yields fixtures wins.
If every page fails for a team, that team's existing fixtures are kept."""
import json, re, sys, datetime as dt
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

BASE = "https://www.live-footballontv.com/"
PAGES = {
    "mc": ["man-city-on-tv.html"],
    "aw": ["arsenal-women-on-tv.html", "wsl-on-tv.html"],
    "mu": ["man-utd-women-on-tv.html", "wsl-on-tv.html"],   # fall back to the WSL listing
    "cw": ["chelsea-women-on-tv.html", "wsl-on-tv.html"],
    "li": ["england-women-on-tv.html"],
    "en": ["england-on-tv.html"],
}
LON = ZoneInfo("Europe/London")
DATE = re.compile(r"^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$")
TIME = re.compile(r"^(\d{1,2}:\d{2}|TBC|TBA)$", re.I)
MATCH = re.compile(r"^(.+?)\s+v\s+(.+)$")
# Channel names. Lines may hold one name or several run together ("Sky Sports MixSky Mix"), so match by token.
TOKEN = re.compile(
    r"Sky Sports (?:Main Event|Premier League|Football|Mix|Ultra HDR|Cricket|Golf|TBC)|Sky Sports\+|Sky Mix|Sky One"
    r"|BBC (?:One|Two|Three|Four|iPlayer|Sport Website|Sport Web|TBC|Scotland|Alba)|ITV(?: TBC|[1-4X])?|STV(?: Player)?"
    r"|S4C(?: Online)?|TNT Sports (?:\d|Ultimate|TBC)|HBO Max|Disney\+|Amazon Prime (?:Video|PPV)|DAZN|WSL2? YouTube|Premier Sports (?:\d|TBC)")
DROP = {"Sky Mix", "Sky Sports Ultra HDR", "BBC Sport Website", "BBC Sport Web", "STV", "STV Player", "S4C Online", "BBC Scotland", "BBC Alba"}
UNWANTED = re.compile(r"Women|\bU\d\d\b|Lionesses")
TEAM = {
    "mc": lambda t: "Manchester City" in t and not UNWANTED.search(t),
    "aw": lambda t: bool(re.search(r"Arsenal\s+(Women|WFC)", t)),
    "mu": lambda t: bool(re.search(r"(Manchester United|Man Utd)\s+(Women|WFC)", t)),
    "cw": lambda t: bool(re.search(r"Chelsea\s+(Women|WFC)", t)),
    "li": lambda t: "England" in t and not re.search(r"\bU\d\d\b", t),
    "en": lambda t: "England" in t and "Women" not in t and not re.search(r"\bU\d\d\b", t),
}

def tidy(name):
    name = re.sub(r"\s*\(.*?\)\s*$", "", name).strip()
    name = name.replace("Manchester City", "Man City").replace("Manchester United", "Man Utd")
    return re.sub(r"\s+Women$", "", name)

def channels(line):
    """-> (names, unconfirmed) or None if the line isn't a channel line."""
    found = TOKEN.findall(line)
    if not found or TOKEN.sub("", line).strip():
        return None
    names, unsure = [], False
    for c in found:
        if c.endswith(" TBC"):
            unsure, c = True, c[:-4]
        if c in DROP or c in names:
            continue
        names.append(c)
    return names, unsure

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
            if mm and TEAM[key](mm[1] + " v " + mm[2]):
                j, comp, chans, unsure = i + 2, "", [], False
                if j < len(lines) and not channels(lines[j]) and not TIME.match(lines[j]) and not DATE.match(lines[j]):
                    comp = lines[j]; j += 1
                while j < len(lines) and channels(lines[j]):
                    names, u = channels(lines[j])
                    unsure = unsure or u
                    chans += [c for c in names if c not in chans]
                    j += 1
                tbc = not re.match(r"\d", t)
                hh, mi = (12, 0) if tbc else map(int, t.split(":"))
                iso = dt.datetime(day.year, day.month, day.day, hh, mi, tzinfo=LON).isoformat()
                note = ("Kick-off time to be confirmed" if tbc else "") if chans and not unsure else \
                       ("Kick-off time and channel to be confirmed" if tbc else "Channel to be confirmed")
                out.append({"t": key, "iso": iso, "comp": comp, "h": tidy(mm[1]), "a": tidy(mm[2]),
                            "ch": chans, "note": note, "tbc": tbc})
        i += 1
    return out

def fetch_team(key):
    for slug in PAGES[key]:
        try:
            r = requests.get(BASE + slug, timeout=30, headers={"User-Agent": "Mozilla/5.0 fixtures-page"})
            r.raise_for_status()
            got = parse(BeautifulSoup(r.text, "html.parser").get_text("\n"), key)
            if got:
                print(f"{key}: {len(got)} fixtures from {slug}")
                return got
            print(f"{key}: {slug} had no matching fixtures", file=sys.stderr)
        except Exception as e:
            print(f"{key}: {slug} failed ({e})", file=sys.stderr)
    return []

def main():
    try: old = json.load(open("fixtures.json"))["fixtures"]
    except Exception: old = []
    new, now = [], dt.datetime.now(LON)
    for key in PAGES:
        got = [g for g in fetch_team(key) if dt.datetime.fromisoformat(g["iso"]) > now - dt.timedelta(hours=3)]
        if not got:
            print(f"::warning::fixtures: nothing found for {key}; keeping its previous fixtures")
        new += got or [f for f in old if f["t"] == key]
    new.sort(key=lambda f: f["iso"])
    json.dump({"updated": now.strftime("%-d %b %Y, %H:%M"), "updated_iso": now.isoformat(), "fixtures": new},
              open("fixtures.json", "w"), indent=1, ensure_ascii=False)

if __name__ == "__main__":
    main()
