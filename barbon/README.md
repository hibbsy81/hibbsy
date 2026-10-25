# Barbon Village website (GitHub Pages)

Pages: Home, St Bartholomew's Church (`church/`), Parish Council (`pc/`).
It is a plain static site – no server and nothing to install.

## One-off setup

1. **Create a GitHub repository** (public – GitHub Pages on free accounts needs this, and the minutes are meant to be public anyway) and upload everything in this folder to the `main` branch.
2. **Turn on Pages:** repository → *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
   The "Publish website" workflow (in `.github/workflows`) then publishes the site every time something changes. Check progress under the *Actions* tab.
3. **Connect the uploader to your repository:** edit `pc/config.js` and replace `YOUR-GITHUB-USERNAME` and `YOUR-REPOSITORY-NAME` (use the organisation name if the repo belongs to one).
4. **Custom domain (optional, e.g. barbon.org.uk):** *Settings → Pages → Custom domain*, then add the DNS records GitHub tells you to. Tick *Enforce HTTPS*.

## Who can upload minutes

GitHub decides – only people with **write access** to the repository can add or delete minutes.

*Settings → Collaborators → Add people* (or manage a team if the repo belongs to an organisation). To remove someone's access, remove them there.

### How an authorised person uploads (on the Parish Council page)

Each person creates their own access token once:

1. Sign in to GitHub → *Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token*.
2. *Repository access:* **Only select repositories** → choose the Barbon repository.
3. *Permissions → Repository permissions → **Contents: Read and write*** (nothing else).
4. Set an expiry (e.g. 1 year), generate, and copy the token.
5. On the Parish Council page click **Sign in to upload minutes** and paste it. The token is kept only in that browser tab and is forgotten when the tab is closed. Never share it – if it leaks, delete it in GitHub.

Then fill in the meeting date (and optional title), choose the PDF, and upload. The list updates after a minute or two once the site has republished.

### Alternative: upload straight on GitHub

Open the repository → `minutes` folder → *Add file → Upload files*. Name files like this:

    2026-09-01.pdf                          → "Minutes of meeting – 1 September 2026"
    2026-09-01_Annual-Parish-Meeting.pdf    → "Annual Parish Meeting"

Files that don't start with a date (`YYYY-MM-DD`) are ignored.

## Editing the site

Text lives in `index.html`, `church/index.html` and `pc/index.html`. Photos are in `images/`. Colours and fonts are at the top of `style.css`.

To preview on your own computer: `python3 -m http.server` in this folder, then open http://localhost:8000
(the minutes list needs `node scripts/build-index.mjs minutes minutes.json` to be run first).
