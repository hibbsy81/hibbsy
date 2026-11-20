# Fixtures & UK TV guide (sports.html)

A dark-green, mobile-first page of upcoming fixtures and UK TV channels. Plain HTML, CSS and JavaScript, hosted from this repo and kept up to date by a GitHub Action.

## Teams (keys used in the code)
`mc` Man City, `mw` Man City WSL, `aw` Arsenal WSL, `mu` Man Utd WSL, `cw` Chelsea WSL, `li` Lionesses, `en` England Men, `f1` Formula 1 (Sky Sports F1).
- Selection is multi-select, remembered in localStorage and shown in the address (for example `#mc,cw`).
- Phone: All across the top, then F1 and WSL, then National (Lionesses + England Men) and Man City. WSL and National are group buttons.
- Computer: All, then F1, Man City, Lionesses, England Men, then the four WSL teams.

## Files
| File | What it is |
| --- | --- |
| `sports.html` | The whole page and its script. Also holds a built-in fallback copy of the fixtures (the `EMBED` line), which the updater refreshes. |
| `fixtures.json` | Written by the updater. Never upload it by hand. |
| `scripts/update.py` | The updater. |
| `.github/workflows/update.yml` | Runs the updater twice a day (cron `23 6,18 * * *`), commits `fixtures.json` and `sports.html`, and fails the run if there is a repeat problem. |
| `menu.js`, `menu.css` | The shared burger menu (hidden in the installed app). |
| `sports.webmanifest`, `sports-sw.js`, `sports-icons/` | The installable web app. |
| `logos/teams/<key>.png` | Team logos (`f1.png` too). |
| `logos/opponents/<club-slug>.png` | Opponent logos. Open `sports.html?logos` to see which are missing. |
| `logos/channels/<brand>.png` | bbc, itv, sky, tnt, hbo, disney, prime, dazn, youtube. |
| `logos/flags/<code>.png` | Country flags for F1 cards (already included). |

## After changing the page
Raise the number in `const V` at the top of `sports-sw.js` (currently `fixtures-v22`) so installed copies refresh.

## How the page behaves
- A Next up card sits at the top, then cards grouped by month. Each card shows both clubs' logos (home first), channel badges and a dashed TBC badge when a channel is unconfirmed.
- A match between two of your teams shows once with both names. Women's cards get a faint pink glow, men's a faint blue one (F1 has neither).
- Live for 2 hours after kick-off, Full time until 3 hours, then it disappears.
- Formula 1: one card per day, listing that day's sessions (Qualifying, Sprint Qualifying, Sprint, Race). Sprint weekends are marked in the competition line.
- "Add to calendar" on each card downloads an `.ics` file (all remaining sessions on an F1 day card).
- The page reloads the fixtures when the app or tab comes back to the front.
- The bottom line says "Fixtures updated ..." and turns amber after 36 hours, or if a team has not refreshed for 2+ days.
- Pinch and double-tap zoom are switched off.

## The updater
- Football comes from live-footballontv.com team pages. It checks `robots.txt`, reads each page once per run, pauses 3 seconds between requests and identifies itself honestly. Failed fetches are retried twice (10 then 30 seconds later).
- Women's teams fall back to `wsl-on-tv.html` and `womens-champions-league-on-tv.html`.
- F1 session times come from the free Jolpica calendar (`api.jolpi.ca`), for the next 60 days. Sky Sports F1 is the only channel shown.
- One spelling per club (the `ALIAS` table, in the updater and the page) so each club needs a single logo file.
- If a page fails or returns far fewer fixtures than before, that team's old fixtures are kept. A team page that says "No Upcoming TV Fixtures" counts as healthy.
- Alerts: the first failed run for a team only logs a warning. If the same team fails again on the next run, the Action goes red and GitHub emails you (turn on Actions notifications in GitHub Settings > Notifications).

## Checking the Action
Actions tab > Update fixtures > Run workflow. Open the run, then the `update` job, then the **Update fixtures** step. Each team should report fixtures (or say there are none upcoming), and you should see `f1: N sessions in the next 60 days`. Yellow lines are warnings, red `Error:` lines name the team that needs attention.

## Decisions to keep
No emoji, no footnotes or credit lines at the bottom, no FREE tags, no STV, no scores or results, no countdowns. Title centred in Bricolage Grotesque ExtraBold; Inter everywhere else. Plain brand wording (`Man Utd`, `Man City`).
