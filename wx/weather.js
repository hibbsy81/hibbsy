/*
 * Configure WORKER_URL after deploying worker.js to Cloudflare.
 * Example: https://aviation-weather-api.your-subdomain.workers.dev
 */
const WORKER_URL = "https://aviation-weather-api.mike-69f.workers.dev/";
const $ = (id) => document.getElementById(id);
const form = $("search-form");
const input = $("icao-input");
let refreshTimer;

function setStatus(message, kind="") {
  $("status").textContent = message;
  $("status").className = `status ${kind}`;
}
function val(v, suffix="") { return v === null || v === undefined || v === "" ? "—" : `${v}${suffix}`; }
function round(v, n=0) { return Number.isFinite(Number(v)) ? Number(v).toFixed(n) : null; }
function cToF(c) { return c == null ? null : (Number(c)*9/5+32); }
function hpaToInHg(hpa) { return hpa == null ? null : Number(hpa)/33.8638867; }
function visToSm(v) { if (v == null) return null; const n=Number(v); return Number.isFinite(n) ? n/1609.344 : v; }
function categoryFrom(ceilingFt, visSm) {
  const c = Number(ceilingFt), v = Number(visSm);
  if (!Number.isFinite(c) && !Number.isFinite(v)) return "—";
  if ((Number.isFinite(c) && c < 500) || (Number.isFinite(v) && v < 1)) return "LIFR";
  if ((Number.isFinite(c) && c < 1000) || (Number.isFinite(v) && v < 3)) return "IFR";
  if ((Number.isFinite(c) && c <= 3000) || (Number.isFinite(v) && v <= 5)) return "MVFR";
  return "VFR";
}
function ceilingFromClouds(clouds) {
  if (!Array.isArray(clouds)) return null;
  const layers = clouds.filter(x => ["BKN","OVC","VV"].includes(String(x.cover || "").toUpperCase()))
    .map(x => Number(x.base)).filter(Number.isFinite);
  return layers.length ? Math.min(...layers) : null;
}
function getFlightCategory(m) {
  if (m.fltcat) return String(m.fltcat).toUpperCase();
  const vis = m.visib != null ? (String(m.visib).includes("+") ? 10 : Number(m.visib)) : null;
  return categoryFrom(ceilingFromClouds(m.clouds), vis);
}
function formatWind(dir, speed, gust) {
  if (dir == null && speed == null) return "—";
  const d = dir == null ? "VRB" : `${String(dir).padStart(3,"0")}°`;
  return `${d} @ ${speed == null ? "—" : `${speed} kt`}`;
}
function setText(id, text) { $(id).textContent = text; }
function dateTime(s) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString("en-GB",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZoneName:"short"});
}
function wxLabel(code) {
  const map={0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Depositing rime fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Heavy rain showers",95:"Thunderstorm",96:"Thunderstorm / hail",99:"Thunderstorm / hail"};
  return map[Number(code)] || "—";
}
function wxIcon(code) {
  const c=Number(code);
  if(c===0) return "☀"; if([1,2].includes(c)) return "🌤"; if(c===3) return "☁";
  if([45,48].includes(c)) return "〰"; if([51,53,55,61,63,65,80,81,82].includes(c)) return "🌧";
  if([71,73,75].includes(c)) return "❄"; if(c>=95) return "⛈"; return "·";
}
function setCategory(category) {
  const card=$("flight-category").closest(".category-card");
  card.dataset.category=category;
  setText("flight-category",category);
}
function calcDensityAltitude(elevFt, tempC, altimeterInHg) {
  if (![elevFt,tempC,altimeterInHg].every(x=>Number.isFinite(Number(x)))) return null;
  const pressureAlt=Number(elevFt)+(29.92-Number(altimeterInHg))*1000;
  const isaTemp=15-(1.98*Number(elevFt)/1000);
  return Math.round(pressureAlt+120*(Number(tempC)-isaTemp));
}
async function fetchJson(url) {
  const r=await fetch(url);
  if(!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}
function first(arr) { return Array.isArray(arr) && arr.length ? arr[0] : null; }

async function loadWeather(code) {
  if (WORKER_URL.includes("YOUR-WORKER-NAME")) {
    setStatus("Setup required: deploy worker.js to Cloudflare and add its URL to weather.js.", "error");
    return;
  }
  clearTimeout(refreshTimer);
  $("results").hidden=true;
  setStatus(`Retrieving weather for ${code}…`, "loading");
  $("search-button").disabled=true;
  try {
    const payload=await fetchJson(`${WORKER_URL.replace(/\/$/,"")}/?icao=${encodeURIComponent(code)}`);
    const metar=first(payload.metar), taf=first(payload.taf), station=first(payload.station) || metar || taf;
    if(!metar && !taf) throw new Error("No recent METAR or TAF was found for this ICAO code. Check the identifier and try again.");

    const lat=station?.lat ?? station?.latitude ?? metar?.lat ?? taf?.lat;
    const lon=station?.lon ?? station?.longitude ?? metar?.lon ?? taf?.lon;
    const elev=station?.elev ?? station?.elevation ?? metar?.elev ?? taf?.elev;
    const airportName=station?.name ?? station?.site ?? station?.airport ?? "";
    let forecast=null;
    if(Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
      const params=new URLSearchParams({
        latitude:lat,longitude:lon,timezone:"UTC",forecast_days:"10",forecast_hours:"24",
        wind_speed_unit:"kn",temperature_unit:"celsius",precipitation_unit:"mm",
        current:"temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        hourly:"temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,weather_code,visibility,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant"
      });
      forecast=await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    }
    render(code,station,metar,taf,forecast,elev,airportName);
    setStatus("Weather data loaded. Check the observation and forecast issue times below.", "");
    $("results").hidden=false;
    refreshTimer=setTimeout(()=>loadWeather(code),15*60*1000);
  } catch(err) {
    setStatus(err.message || "Unable to retrieve weather at present.", "error");
  } finally { $("search-button").disabled=false; }
}
function render(code,station,m,t,f,elev,name) {
  const title=name ? `${code} · ${name}` : code;
  setText("airport-title",title);
  const elevation=Number.isFinite(Number(elev)) ? `${Math.round(Number(elev))} ft elevation` : "Airport elevation unavailable";
  const location=(station?.lat != null && station?.lon != null) ? `${Number(station.lat).toFixed(3)}, ${Number(station.lon).toFixed(3)} · ` : "";
  setText("airport-meta",`${location}${elevation}`);
  setText("updated-label",`Updated ${new Date().toLocaleTimeString("en-GB",{timeZone:"UTC",hour:"2-digit",minute:"2-digit"})}Z`);
  if(m) {
    const cat=getFlightCategory(m), ceiling=ceilingFromClouds(m.clouds);
    const temp=m.temp, dew=m.dewp;
    const altRaw=m.altim;
    // AviationWeather JSON METAR altim is inches of mercury.
    const altIn=altRaw==null ? null : Number(altRaw);
    const altHpa=altIn==null ? null : altIn*33.8638867;
    const humidity=(temp!=null && dew!=null) ? Math.round(100*Math.exp((17.625*Number(dew))/(243.04+Number(dew)))/Math.exp((17.625*Number(temp))/(243.04+Number(temp)))) : null;
    setCategory(cat);
    setText("weather-description",m.wxString || "Observed conditions");
    setText("ceiling",ceiling==null ? "Unlimited / N/A" : `${Math.round(ceiling).toLocaleString("en-GB")}'`);
    setText("visibility",m.visib==null ? "—" : `${m.visib}${String(m.visib).includes("+")?"":" SM"}`);
    setText("temperature",temp==null?"—":`${round(temp)}°C / ${round(cToF(temp))}°F`);
    setText("dewpoint",dew==null?"—":`${round(dew)}°C / ${round(cToF(dew))}°F`);
    setText("humidity",humidity==null?"Humidity unavailable":`${humidity}% relative humidity`);
    setText("wind",formatWind(m.wdir,m.wspd));
    setText("gust",m.wgst==null?"No gust reported":`Gust ${m.wgst} kt`);
    setText("altimeter",altIn==null?"—":`${round(altIn,2)} inHg / ${round(altHpa)} hPa`);
    const da=calcDensityAltitude(elev,temp,altIn);
    setText("density-altitude",da==null?"—":`${da.toLocaleString("en-GB")}'`);
    setText("metar-time",`Observed ${dateTime(m.obsTime || m.reportTime)}`);
    setText("metar-raw",m.rawOb || "Raw METAR unavailable.");
    setText("metar-status",m.rawOb?"AVAILABLE":"UNAVAILABLE");
  } else {
    ["flight-category","weather-description","ceiling","visibility","temperature","dewpoint","humidity","wind","gust","altimeter","density-altitude","metar-time","metar-raw","metar-status"].forEach(id=>setText(id,"—"));
  }
  if(t) {
    setText("taf-raw",t.rawTAF || "Raw TAF unavailable.");
    setText("taf-validity",t.validTimeFrom && t.validTimeTo ? `${dateTime(t.validTimeFrom)} – ${dateTime(t.validTimeTo)}` : "");
    setText("taf-status","AVAILABLE");
  } else {
    setText("taf-raw","No TAF available for this airport.");
    setText("taf-validity","");
    setText("taf-status","NO TAF");
  }
  const current=f?.current;
  setText("rain",current ? val(current.precipitation," mm") : "—");
  if(f) { renderHourly(f); renderDaily(f); }
  else { $("hourly-body").innerHTML='<tr><td colspan="9">Forecast unavailable: airport coordinates were not returned by the station data source.</td></tr>'; $("daily-grid").innerHTML=""; }
}
function renderHourly(f) {
  const h=f.hourly, body=$("hourly-body");
  if(!h?.time?.length){body.innerHTML='<tr><td colspan="9">No hourly forecast returned.</td></tr>';return;}
  const count=Math.min(24,h.time.length), rows=[];
  for(let i=0;i<count;i++){
    const time=new Date(h.time[i]);
    const clock=time.toLocaleTimeString("en-GB",{timeZone:"UTC",hour:"2-digit",minute:"2-digit"});
    const temp=h.temperature_2m?.[i], dew=h.dew_point_2m?.[i], dir=h.wind_direction_10m?.[i], speed=h.wind_speed_10m?.[i], gust=h.wind_gusts_10m?.[i], vis=h.visibility?.[i], cloud=h.cloud_cover?.[i], rain=h.precipitation_probability?.[i], code=h.weather_code?.[i];
    rows.push(`<tr><td><strong>${clock}Z</strong></td><td>${wxIcon(code)} ${wxLabel(code)}</td><td>${val(round(temp))}°C</td><td>${val(round(dew))}°C</td><td>${dir==null?"—":`${Math.round(dir)}°`} / ${speed==null?"—":`${round(speed)} kt`}</td><td>${gust==null?"—":`${round(gust)} kt`}</td><td>${vis==null?"—":`${(vis/1000).toFixed(1)} km`}</td><td>${val(cloud,"%")}</td><td>${val(rain,"%")}</td></tr>`);
  }
  body.innerHTML=rows.join("");
}
function renderDaily(f) {
  const d=f.daily, grid=$("daily-grid");
  if(!d?.time?.length){grid.innerHTML="";return;}
  grid.innerHTML=d.time.map((day,i)=>{
    const date=new Date(day+"T12:00:00Z");
    const label=date.toLocaleDateString("en-GB",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short"});
    return `<article class="day-card"><div class="day-name">${label}</div><div class="day-icon">${wxIcon(d.weather_code?.[i])}</div><div class="day-temps">${round(d.temperature_2m_max?.[i]) ?? "—"}° / ${round(d.temperature_2m_min?.[i]) ?? "—"}°</div><div class="day-details">${wxLabel(d.weather_code?.[i])}<br>Wind max ${d.wind_speed_10m_max?.[i]==null?"—":`${round(d.wind_speed_10m_max[i])} kt`}<br>Rain ${d.precipitation_probability_max?.[i]==null?"—":`${d.precipitation_probability_max[i]}%`}</div></article>`;
  }).join("");
}
form.addEventListener("submit",e=>{e.preventDefault();const code=input.value.trim().toUpperCase();if(!/^[A-Z]{4}$/.test(code)){setStatus("Please enter a valid four-letter ICAO identifier.","error");return;}input.value=code;loadWeather(code);});
document.querySelectorAll("[data-code]").forEach(b=>b.addEventListener("click",()=>{input.value=b.dataset.code;loadWeather(b.dataset.code);}));
input.addEventListener("input",()=>{input.value=input.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,4);});
