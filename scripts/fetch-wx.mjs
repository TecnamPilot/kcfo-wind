// Fetches G-AIRMETs and pilot reports (PIREPs) from aviationweather.gov and writes wx.json.
// aviationweather.gov does not allow web pages on other sites to read its data, so GitHub
// runs this on a timer and the app reads the saved file instead.
import { writeFileSync } from "node:fs";

const KCFO = { lat: 39.7853, lon: -104.5431 };
const PIREP_RADIUS_NM = 40;
// aviationweather.gov asks for a custom user agent. Its firewall answered 403 to one that
// contained "fetch (GitHub Actions)", and 200 to this one (checked 2026-11-10).
const UA = { "User-Agent": "kcfo-wind/1.0 (personal flight-planning page)", Accept: "*/*" };

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distNm(a, b) {
  const r = d => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.sqrt(h));
}
async function getJSON(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  const txt = await res.text();
  return txt.trim() ? JSON.parse(txt) : [];
}

const out = { fetched: new Date().toISOString(), gairmet: { ok: false }, pirep: { ok: false } };
// wx-us.json: the same data for every US airport (all G-AIRMET outlines, all US pilot reports),
// so the app can check any airport the pilot types in. Outlines rounded to 0.01° (about 0.6 nm).
const us = { fetched: out.fetched, gairmet: { ok: false }, pirep: { ok: false } };

try {
  // One request returns one snapshot. A G-AIRMET issue holds five: now and 3, 6, 9 and 12 hours
  // ahead. All five are needed so the app can score a flight later today or tomorrow morning.
  const all = [], errors = [];
  for (const fore of [0, 3, 6, 9, 12]) {
    try {
      const part = await getJSON(`https://aviationweather.gov/api/data/gairmet?format=json&fore=${fore}`);
      if (!Array.isArray(part)) throw new Error("unexpected G-AIRMET format");
      all.push(...part);
    } catch (e) { errors.push(`+${fore} h: ${String(e.message || e)}`); }
    await new Promise(r => setTimeout(r, 1500));
  }
  if (errors.length === 5) throw new Error(errors.join("; "));
  // "areas" counts the entries whose outline could be read. If G-AIRMETs exist but none
  // has a readable outline, the format changed and the app must not report "none over KCFO".
  let areas = 0;
  const items = [];
  for (const g of all) {
    const ring = (g.coords || []).map(c => [Number(c.lon), Number(c.lat)]).filter(p => p.every(Number.isFinite));
    if (ring.length < 3) continue;
    areas++;
    const isArea = String(g.geometryType || g.geom || "AREA").toUpperCase() === "AREA" && String(g.geom || "AREA").toUpperCase() !== "LINE";
    if (!isArea || !pointInRing(KCFO.lon, KCFO.lat, ring)) continue;
    items.push({ hazard: g.hazard, product: g.product, validTime: g.validTime, forecastHour: g.forecastHour,
      base: g.base, top: g.top, level: g.level, severity: g.severity, due_to: g.due_to, tag: g.tag });
  }
  const validTimes = [...new Set(all.map(g => g.validTime).filter(Boolean))].sort();
  out.gairmet = { ok: all.length === 0 || areas > 0, total: all.length, areas, validTimes, items };
  const usItems = [];
  for (const g of all) {
    const ring = (g.coords || []).map(c => [Math.round(Number(c.lon) * 100) / 100, Math.round(Number(c.lat) * 100) / 100]).filter(p => p.every(Number.isFinite));
    const isArea = String(g.geometryType || g.geom || "AREA").toUpperCase() === "AREA" && String(g.geom || "AREA").toUpperCase() !== "LINE";
    if (ring.length < 3 || !isArea) continue;
    usItems.push({ hazard: g.hazard, validTime: g.validTime, base: g.base, top: g.top, due_to: g.due_to, ring });
  }
  us.gairmet = { ...out.gairmet, items: usItems };
  if (all.length > 0 && areas === 0) out.gairmet.error = "no readable outlines: data format may have changed";
  // Snapshots that did not load are simply absent from validTimes, so the app shows "?" for
  // the hours they would have covered instead of treating them as clear.
  if (errors.length) out.gairmet.missing = errors;
} catch (e) { out.gairmet = { ok: false, error: String(e.message || e) }; }

try {
  const all = await getJSON(`https://aviationweather.gov/api/data/pirep?id=KDEN&distance=${PIREP_RADIUS_NM + 10}&age=3&format=json`);
  if (!Array.isArray(all)) throw new Error("unexpected PIREP format");
  const items = [];
  for (const p of all) {
    const lat = Number(p.lat), lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const d = distNm(KCFO, { lat, lon });
    if (d > PIREP_RADIUS_NM) continue;
    items.push({ obsTime: p.obsTime, distNm: Math.round(d), fltLvl: p.fltLvl, fltLvlType: p.fltLvlType, acType: p.acType,
      tbInt1: p.tbInt1, tbInt2: p.tbInt2, tbBas1: p.tbBas1, tbTop1: p.tbTop1, rawOb: p.rawOb });
  }
  out.pirep = { ok: true, total: all.length, items };
} catch (e) { out.pirep = { ok: false, error: String(e.message || e) }; }

try {
  // All US pilot reports from the last 3 hours (bounding box: lat 24-50, lon -125 to -66, plus Alaska/Hawaii not covered).
  const all = await getJSON(`https://aviationweather.gov/api/data/pirep?bbox=24,-125,50,-66&age=3&format=json`);
  if (!Array.isArray(all)) throw new Error("unexpected PIREP format");
  const items = [];
  for (const p of all) {
    const lat = Number(p.lat), lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    items.push({ lat, lon, obsTime: p.obsTime, fltLvl: p.fltLvl, acType: p.acType, tbInt1: p.tbInt1, tbInt2: p.tbInt2, rawOb: p.rawOb });
  }
  us.pirep = { ok: true, total: all.length, items };
} catch (e) { us.pirep = { ok: false, error: String(e.message || e) }; }
writeFileSync("wx-us.json", JSON.stringify(us));
console.log(`US file: ${us.gairmet.items?.length ?? 0} G-AIRMET outlines, ${us.pirep.items?.length ?? 0} pilot reports`);

writeFileSync("wx.json", JSON.stringify(out, null, 1));
console.log(`G-AIRMET: ${JSON.stringify({ ...out.gairmet, items: out.gairmet.items?.length })}`);
console.log(`PIREP: ${JSON.stringify({ ...out.pirep, items: out.pirep.items?.length })}`);
if (!out.gairmet.ok || !out.pirep.ok) process.exitCode = 1;
