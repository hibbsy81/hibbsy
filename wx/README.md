# Aviation Weather — GitHub Pages + Cloudflare Worker

A static aviation-weather dashboard with an ICAO lookup. It retrieves worldwide METAR and TAF data from AviationWeather.gov and model-based hourly/daily forecasts from Open-Meteo. Wind speeds are shown in knots.

## Files

- `index.html` — page structure
- `style.css` — responsive styling
- `weather.js` — lookup, display and forecast logic
- `worker.js` — Cloudflare Worker proxy for AviationWeather.gov
- `wrangler.toml` — optional Wrangler deployment configuration

## 1. Deploy the Cloudflare Worker

1. Create/sign in to a Cloudflare account.
2. Open **Workers & Pages** → **Create** → **Create Worker**.
3. Name it (for example `aviation-weather-api`).
4. Replace the starter code with the contents of `worker.js`.
5. Deploy. Cloudflare will provide a URL similar to:
   `https://aviation-weather-api.YOUR-SUBDOMAIN.workers.dev`
6. Test it by opening:
   `https://YOUR-WORKER-URL/health`
   It should return `{"ok":true,...}`.
7. Test an airport:
   `https://YOUR-WORKER-URL/?icao=EGLL`

No secret or API key is needed for the sources used by this project.

## 2. Configure the website

Open `weather.js` and replace:

```js
const WORKER_URL = "https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev";
```

with your actual Worker URL, retaining the quotes.

## 3. Publish on GitHub Pages

1. Create a GitHub repository, e.g. `aviation-weather`.
2. Upload `index.html`, `style.css` and `weather.js` to the repository root.
3. In the repository, open **Settings** → **Pages**.
4. Under Build and deployment, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`, then Save.
6. Wait for GitHub Pages to publish the site.

The resulting address will look like:
`https://YOUR-GITHUB-USERNAME.github.io/aviation-weather/`

## Data notes

- AviationWeather.gov supplies worldwide METAR and TAF data, but some airports may not have either product or a matching station-information record.
- Open-Meteo is queried using station coordinates returned by the aviation station endpoint. Forecast values are model output, not a TAF.
- METAR visibility is displayed in statute miles as reported. Wind speed and gusts are always displayed in knots.
- Density altitude is estimated from airport elevation, observed temperature and altimeter setting. It is blank if required inputs are missing.
- The browser refreshes the lookup every 15 minutes while the page remains open.
- This project does not currently decode every TAF change group into a separate timeline. It displays the raw official TAF text and its validity interval.

## Important aviation-use notice

This dashboard is for personal information and development only. It is not an approved aviation weather briefing tool and must not be used as the sole source for flight planning or operational decisions. Always consult official, current aviation weather products and applicable operational sources.

## Troubleshooting

- **Setup required message:** `WORKER_URL` has not been changed in `weather.js`.
- **Worker returns 404:** check the ICAO code and try an airport with an active METAR/TAF.
- **Forecast missing:** the station feed may not have returned latitude/longitude for that code.
- **Worker health test fails:** check that the Worker was deployed and its URL was copied correctly.
