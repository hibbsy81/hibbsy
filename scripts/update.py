"""Refresh fixtures.json from live-footballontv.com listings (be gentle: few requests, robots.txt respected).
Each team has a list of pages to try; the first that yields fixtures wins.
Formula 1 session times come from the free Jolpica F1 calendar API (two requests: this year and next); Sky Sports F1 shows every session.
If every page fails for a team, that team's existing fixtures are kept."""
import json, re, sys, time, datetime as dt
import urllib.robotparser
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

BASE = "https://www.live-footballontv.com/"
# Listings shared by every women's club: used if a club's own page is missing or empty.
SHARED = ["wsl-on-tv.html", "womens-champions-league-on-tv.html"]
PAGES = {
    "mc": ["man-city-on-tv.html"],
    "mw": ["man-city-women-on-tv.html"] + SHARED,
    "aw": ["arsenal-women-on-tv.html"] + SHARED,
    "mu": ["man-utd-women-on-tv.html"] + SHARED,
    "cw": ["chelsea-women-on-tv.html"] + SHARED,
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
    "mw": lambda t: bool(re.search(r"(Manchester City|Man City)\s+(Women|WFC)", t)),
    "aw": lambda t: bool(re.search(r"Arsenal\s+(Women|WFC)", t)),
    "mu": lambda t: bool(re.search(r"(Manchester United|Man Utd)\s+(Women|WFC)", t)),
    "cw": lambda t: bool(re.search(r"Chelsea\s+(Women|WFC)", t)),
    "li": lambda t: bool(re.search(r"England\s+Women", t)) and not re.search(r"\bU\d\d\b", t),
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

UA = "Mozilla/5.0 (compatible; personal-fixtures-page; +https://www.hibbs.org.uk/)"
PAUSE = 3          # seconds between requests to the listings site
_pages, _last = {}, [0.0]
_robots = urllib.robotparser.RobotFileParser()

def load_robots():
    try:
        r = requests.get(BASE + "robots.txt", timeout=20, headers={"User-Agent": UA})
        if r.ok:
            _robots.parse(r.text.splitlines()); return
    except Exception:
        pass
    _robots.parse([])                    # no robots.txt reachable: nothing is forbidden

def page_text(slug):
    """Each page is fetched at most once per run (a failure is remembered too)."""
    if slug not in _pages:
        try:
            if not _robots.can_fetch(UA, BASE + slug):
                raise RuntimeError("blocked by robots.txt")
            wait = PAUSE - (time.time() - _last[0])
            if wait > 0:
                time.sleep(wait)
            r = requests.get(BASE + slug, timeout=30, headers={"User-Agent": UA})
            _last[0] = time.time()
            r.raise_for_status()
            _pages[slug] = BeautifulSoup(r.text, "html.parser").get_text("\n")
        except Exception as e:
            _pages[slug] = e
    if isinstance(_pages[slug], Exception):
        raise _pages[slug]
    return _pages[slug]

def fetch_team(key):
    """-> (fixtures, page it came from)"""
    merged, used = {}, []
    for slug in PAGES[key]:
        try:
            got = parse(page_text(slug), key)
        except Exception as e:
            print(f"{key}: {slug} failed ({e})", file=sys.stderr); continue
        if not got:
            print(f"{key}: {slug} had no matching fixtures", file=sys.stderr); continue
        if slug not in SHARED:                       # the club's own page lists every competition
            print(f"{key}: {len(got)} fixtures from {slug}")
            return got, slug
        print(f"{key}: {len(got)} fixtures from shared listing {slug}")
        used.append(slug)
        for g in got:
            merged[(g["iso"], g["h"], g["a"])] = g   # WSL + Champions League pages are combined
    return list(merged.values()), "+".join(used)

# ---- Formula 1: qualifying, sprints and races, from the free Jolpica calendar (Ergast-compatible) ----
F1_API = "https://api.jolpi.ca/ergast/f1/{}.json"
# (key in the API's race record, name shown on the card). Practice sessions are left out on purpose.
F1_SESSIONS = [("SprintQualifying", "Sprint Qualifying"), ("SprintShootout", "Sprint Qualifying"),
               ("Qualifying", "Qualifying"), ("Sprint", "Sprint"), ("Race", "Race")]
F1_CHANNELS = ["Sky Sports F1"]
# Country name as the calendar spells it -> flag file in logos/flags/ (lower-case two-letter code)
F1_FLAGS = {"australia": "au", "china": "cn", "japan": "jp", "bahrain": "bh", "saudi arabia": "sa", "usa": "us",
            "united states": "us", "canada": "ca", "monaco": "mc", "spain": "es", "austria": "at", "uk": "gb",
            "united kingdom": "gb", "great britain": "gb", "belgium": "be", "hungary": "hu", "netherlands": "nl",
            "italy": "it", "azerbaijan": "az", "singapore": "sg", "mexico": "mx", "brazil": "br", "qatar": "qa",
            "uae": "ae", "united arab emirates": "ae", "portugal": "pt", "france": "fr", "turkey": "tr"}
F1_DAYS = 60          # only list sessions up to this many days ahead, so a whole season does not flood the page

def f1_iso(date, time_):
    """API date + UTC time -> London-time ISO string, or None when no time is published yet."""
    if not date or not time_:
        return None
    utc = dt.datetime.fromisoformat(f"{date}T{time_}".replace("Z", "+00:00"))
    return utc.astimezone(LON).isoformat()

def f1_year(year):
    wait = PAUSE - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    r = requests.get(F1_API.format(year), timeout=30, headers={"User-Agent": UA})
    _last[0] = time.time()
    r.raise_for_status()
    out = []
    for race in r.json()["MRData"]["RaceTable"]["Races"]:
        gp = race.get("raceName") or "Grand Prix"
        country = ((race.get("Circuit") or {}).get("Location") or {}).get("country", "")
        cc = F1_FLAGS.get(country.strip().lower(), "")
        if country and not cc:
            print(f"f1: no flag known for country '{country}' ({gp})", file=sys.stderr)
        for key, label in F1_SESSIONS:
            s = {"date": race.get("date"), "time": race.get("time")} if key == "Race" else race.get(key)
            iso = f1_iso((s or {}).get("date"), (s or {}).get("time"))
            if iso:                                   # sessions without a published time are skipped
                out.append({"t": "f1", "iso": iso, "comp": "Formula 1, " + label, "h": gp, "a": "", "cc": cc,
                            "ch": list(F1_CHANNELS), "note": "", "tbc": False})
    return out

def fetch_f1():
    """-> (fixtures, source, ok). ok is True when this year's calendar was read, even if no sessions are left."""
    year = dt.datetime.now(LON).year
    try:
        out = f1_year(year)
    except Exception as e:
        print(f"f1: {year} calendar failed ({e})", file=sys.stderr)
        return [], None, False
    try:
        out += f1_year(year + 1)                      # next season, once its calendar has times
    except Exception as e:
        print(f"f1: {year + 1} calendar not available yet ({e})", file=sys.stderr)
    limit = (dt.datetime.now(LON) + dt.timedelta(days=F1_DAYS)).isoformat()
    out = [f for f in out if dt.datetime.fromisoformat(f["iso"]) <= dt.datetime.fromisoformat(limit)]
    print(f"f1: {len(out)} sessions in the next {F1_DAYS} days from the Jolpica calendar")
    return out, "api.jolpi.ca", True

def main():
    try: prev = json.load(open("fixtures.json"))
    except Exception: prev = {}
    old, old_health = prev.get("fixtures", []), prev.get("health", {})
    now = dt.datetime.now(LON)
    recent = lambda f: dt.datetime.fromisoformat(f["iso"]) > now - dt.timedelta(hours=3)
    load_robots()
    new, health = [], {}
    for key in [*PAGES, "f1"]:
        ok = False
        if key == "f1":
            got, src, ok = fetch_f1()
        else:
            got, src = fetch_team(key)
        got = [g for g in got if recent(g)]
        kept = [f for f in old if f["t"] == key and recent(f)]
        upcoming_before = len([f for f in kept if dt.datetime.fromisoformat(f["iso"]) > now])
        if key != "f1" and got and upcoming_before >= 4 and len(got) < upcoming_before / 2:
            print(f"::warning::fixtures: {key} returned only {len(got)} fixtures (had {upcoming_before}); keeping the previous ones in case the page layout changed")
            got = []
        if got or ok:                     # F1 can legitimately have nothing left in the off-season
            new += got
            health[key] = {"last_ok_iso": now.isoformat(), "from": src, "count": len(got)}
        else:
            print(f"::warning::fixtures: nothing usable for {key}; keeping its previous fixtures")
            new += kept
            health[key] = {"last_ok_iso": old_health.get(key, {}).get("last_ok_iso"), "from": None, "count": len(kept)}
    new.sort(key=lambda f: f["iso"])
    json.dump({"updated": now.strftime("%-d %b %Y, %H:%M"), "updated_iso": now.isoformat(), "health": health, "fixtures": new},
              open("fixtures.json", "w"), indent=1, ensure_ascii=False)

if __name__ == "__main__":
    main()
