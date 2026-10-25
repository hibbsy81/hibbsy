"""Fetch recent results into results.json using TheSportsDB's free API (test key 3, ~30 requests/minute).
Fails soft: if anything goes wrong the existing results.json is left alone."""
import json, re, sys, time, datetime as dt
from zoneinfo import ZoneInfo
import requests

API = "https://www.thesportsdb.com/api/v1/json/3/"
LON = ZoneInfo("Europe/London")
# key -> names to try when looking the team up (first exact match wins)
TEAMS = {
    "mc": ["Manchester City"],
    "aw": ["Arsenal Women", "Arsenal WFC", "Arsenal Ladies"],
    "mu": ["Manchester United Women", "Manchester United WFC"],
    "cw": ["Chelsea Women", "Chelsea FC Women", "Chelsea Ladies"],
    "li": ["England Women"],
    "en": ["England"],
}
KEEP_PER_TEAM = 8

def get(path, **params):
    time.sleep(2.2)                      # stay well inside the rate limit
    r = requests.get(API + path, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def team_id(names):
    for n in names:
        for t in get("searchteams.php", t=n).get("teams") or []:
            if t.get("strSport") == "Soccer" and (t.get("strTeam") or "").lower() == n.lower():
                return t["idTeam"]
    return None

def tidy(name):
    name = (name or "").replace("Manchester City", "Man City").replace("Manchester United", "Man Utd")
    while True:
        new = re.sub(r"\s+(Women|Ladies|WFC|W\.F\.C\.|FC)$", "", name.strip())
        if new == name.strip(): return new
        name = new

def when(e):
    ts = e.get("strTimestamp")
    if ts:
        d = dt.datetime.fromisoformat(ts.replace("Z", ""))
    else:
        d = dt.datetime.fromisoformat(f"{e['dateEvent']}T{(e.get('strTime') or '12:00:00')[:8]}")
    return d.replace(tzinfo=dt.timezone.utc).isoformat()   # the API times are UTC

def convert(key, e):
    if e.get("intHomeScore") in (None, "") or e.get("intAwayScore") in (None, ""):
        return None
    return {"t": key, "iso": when(e), "comp": e.get("strLeague") or "",
            "h": tidy(e.get("strHomeTeam")), "a": tidy(e.get("strAwayTeam")),
            "hs": int(e["intHomeScore"]), "as": int(e["intAwayScore"])}

def main():
    try:
        old = json.load(open("results.json"))
    except Exception:
        old = {"ids": {}, "results": []}
    ids, results = dict(old.get("ids", {})), list(old.get("results", []))
    for key, names in TEAMS.items():
        try:
            ids[key] = ids.get(key) or team_id(names)
            if not ids[key]:
                print(f"::warning::results: no TheSportsDB team found for {key} ({names[0]})"); continue
            got = [c for e in (get("eventslast.php", id=ids[key]).get("results") or []) if (c := convert(key, e))]
            print(f"{key}: {len(got)} results")
            results = [r for r in results if r["t"] != key or (r["iso"], r["h"], r["a"]) not in {(g["iso"], g["h"], g["a"]) for g in got}] + got
        except Exception as ex:
            print(f"::warning::results: {key} failed ({ex})", file=sys.stderr)
    out = []
    for key in TEAMS:
        mine = sorted((r for r in results if r["t"] == key), key=lambda r: r["iso"], reverse=True)[:KEEP_PER_TEAM]
        out += mine
    if not out:
        print("::warning::results: nothing to write; leaving results.json alone"); return
    out.sort(key=lambda r: r["iso"], reverse=True)
    now = dt.datetime.now(LON)
    json.dump({"updated": now.strftime("%-d %b %Y, %H:%M"), "updated_iso": now.isoformat(), "ids": ids, "results": out},
              open("results.json", "w"), indent=1, ensure_ascii=False)

if __name__ == "__main__":
    main()
