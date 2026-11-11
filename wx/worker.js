/*
 * Cloudflare Worker: proxies AviationWeather.gov requests to avoid browser CORS.
 * Deploy this file as a Worker. No API key is required.
 */
const AWC = "https://aviationweather.gov/api/data";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (url.pathname === "/health") {
      return json({ ok: true, service: "aviation-weather-proxy" });
    }
    const icao = (url.searchParams.get("icao") || "").trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(icao)) {
      return json({ error: "Supply a four-letter ICAO identifier using ?icao=EGLL" }, 400);
    }

    try {
      const headers = { "Accept": "application/json", "User-Agent": "PersonalAviationWeatherDashboard/1.0 (GitHub Pages)" };
      const endpoints = [
        ["metar", `${AWC}/metar?ids=${icao}&format=json`],
        ["taf", `${AWC}/taf?ids=${icao}&format=json`],
        ["station", `${AWC}/stationinfo?ids=${icao}&format=json`]
      ];
      const results = await Promise.all(endpoints.map(async ([key, target]) => {
        try {
          const response = await fetch(target, { headers, cf: { cacheTtl: key === "station" ? 86400 : 300, cacheEverything: true } });
          if (response.status === 204 || response.status === 404) return [key, []];
          if (!response.ok) return [key, []];
          const data = await response.json();
          return [key, Array.isArray(data) ? data : (data ? [data] : [])];
        } catch (_) { return [key, []]; }
      }));
      const body = Object.fromEntries(results);
      body.icao = icao;
      if (!body.metar.length && !body.taf.length && !body.station.length) {
        return json({ error: `No weather or station data found for ${icao}.` }, 404);
      }
      return json(body, 200, { "Cache-Control": "public, max-age=120, s-maxage=300" });
    } catch (error) {
      return json({ error: "Weather source temporarily unavailable." }, 502);
    }
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(), ...extra }
  });
}
