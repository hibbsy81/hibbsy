"""Check that every logo the page wants exists in the repo, and open (or update, or close) a GitHub issue to say which are missing.
GitHub emails you when the issue is created and when new names are added, so you know when there is a logo to download.
Run by the workflow after the fixtures update. Needs the GH_TOKEN environment variable and the `gh` command (both present in GitHub Actions).
Use `python scripts/check_logos.py --dry` to just print the list."""
import json, os, re, subprocess, sys, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
from update import ALIAS            # same one-spelling-per-club table the updater uses

TITLE = "Logos needed"
ROOT = {"f1": "Formula 1", "mc": "Man City", "mw": "Man City", "aw": "Arsenal", "mu": "Man Utd", "cw": "Chelsea", "li": "England", "en": "England"}

def plain(n):
    return "".join(c for c in unicodedata.normalize("NFD", str(n)) if not unicodedata.combining(c)).strip()

def slug(n):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", plain(n).lower().replace("&", "and")))

def canon(n):
    return ALIAS.get(plain(n).lower(), n)

def brand(c):
    for pat, k in [(r"^BBC", "bbc"), (r"^ITV", "itv"), (r"^Sky", "sky"), (r"^TNT", "tnt"), (r"^HBO", "hbo"), (r"^Disney", "disney"),
                   (r"YouTube", "youtube"), (r"Prime", "prime"), (r"^DAZN", "dazn")]:
        if re.search(pat, c, re.I if k == "dazn" else 0):
            return k
    return re.sub(r"[^a-z0-9]+", "-", c.lower())

def country_map():
    html = open("sports.html", encoding="utf-8").read()
    m = re.search(r"const COUNTRY=(\{.*?\});", html)
    return json.loads(m.group(1)) if m else {}

def needed():
    """-> {folder: set(file names)} the page wants for the fixtures in fixtures.json"""
    fixtures = json.load(open("fixtures.json", encoding="utf-8"))["fixtures"]
    countries = country_map()
    need = {"logos/teams": set(), "logos/opponents": set(), "logos/channels": set(), "logos/flags": set()}
    need["logos/teams"] |= {k + ".png" for k in ROOT}   # the team buttons always use these
    merged = {}                                   # the same match from two of your teams' pages is one card
    for f in fixtures:
        for c in f.get("ch", []):
            need["logos/channels"].add(brand(c) + ".png")
        if f["t"] == "f1":
            need["logos/teams"].add("f1.png")
            if f.get("cc"):
                need["logos/flags"].add(f["cc"] + ".png")
            continue
        h, a = canon(f["h"]), canon(f["a"])
        g = merged.setdefault(f["iso"] + "|" + "|".join(sorted([h.lower(), a.lower()])), {"names": [h, a], "teams": set()})
        g["teams"].add(f["t"])
    for g in merged.values():
        intl = bool(g["teams"] & {"en", "li"})
        for n in g["names"]:
            own = [k for k in g["teams"] if ROOT[k] in n]
            if own:
                if intl and own[0] in ("en", "li"):
                    need["logos/flags"].add("gb-eng.png")
                else:
                    need["logos/teams"].add(own[0] + ".png")
            elif intl and countries.get(plain(n).lower()):
                need["logos/flags"].add(countries[plain(n).lower()] + ".png")
            else:
                need["logos/opponents"].add(slug(n) + ".png")
    return need

def missing():
    return {d: sorted(f for f in files if not os.path.exists(os.path.join(d, f))) for d, files in needed().items()}

def body(miss):
    out = ["These logo files are used by the page but are not in the repo yet. Save PNGs in the folder shown, with exactly these names.", ""]
    for d, files in miss.items():
        if files:
            out += [f"**{d}/**"] + [f"- `{f}`" for f in files] + [""]
    out.append("Opening `sports.html?logos` shows the same opponent list. This issue updates itself and closes when everything is present.")
    return "\n".join(out)

def gh(*args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True)
    if r.returncode:
        print(f"gh {' '.join(args[:2])} failed: {r.stderr.strip()}", file=sys.stderr)
    return r

def main():
    miss = missing()
    names = {f"{d}/{f}" for d, fs in miss.items() for f in fs}
    print(f"{len(names)} logo files missing")
    for n in sorted(names):
        print("  " + n)
    if "--dry" in sys.argv:
        return
    r = gh("issue", "list", "--state", "open", "--search", f'"{TITLE}" in:title', "--json", "number,title,body", "--limit", "10")
    existing = next((i for i in json.loads(r.stdout or "[]") if i["title"] == TITLE), None) if r.returncode == 0 else None
    if r.returncode:
        sys.exit(0)                                   # could not talk to GitHub: do not fail the run over it
    text = body(miss)
    if names:
        if not existing:
            owner = os.environ.get("GITHUB_REPOSITORY_OWNER")
            gh("issue", "create", "--title", TITLE, "--body", text, *(["--assignee", owner] if owner else []))
        elif existing["body"].strip() != text.strip():
            before = set(re.findall(r"`([^`]+\.png)`", existing["body"]))
            after = set(re.findall(r"`([^`]+\.png)`", text))
            gh("issue", "edit", str(existing["number"]), "--body", text)
            added = sorted(after - before)
            if added:                                  # a comment is what triggers the email for new names
                gh("issue", "comment", str(existing["number"]), "--body", "New logos needed: " + ", ".join(f"`{x}`" for x in added))
    elif existing:
        gh("issue", "close", str(existing["number"]), "--comment", "All logos are present now.")

if __name__ == "__main__":
    main()
