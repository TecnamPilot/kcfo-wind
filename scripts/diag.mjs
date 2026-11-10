// Temporary diagnostic: how to get every G-AIRMET forecast snapshot.
import { gunzipSync } from "node:zlib";
const H = { "User-Agent": "kcfo-wind/1.0 (personal flight-planning page)", Accept: "*/*" };
const get = async u => { const r = await fetch(u, { headers: H }); return { s: r.status, b: Buffer.from(await r.arrayBuffer()) }; };
const y = await get("https://aviationweather.gov/data/schema/openapi.yaml");
const yt = y.b.toString(); const i = yt.indexOf("/api/data/gairmet");
console.log("OPENAPI", y.s, "\n" + yt.slice(i, i + 2500));
for (const q of ["format=json", "format=json&fore=3", "format=json&fore=6"]) {
  const r = await get("https://aviationweather.gov/api/data/gairmet?" + q);
  let info = r.b.toString().slice(0, 150);
  try { const j = JSON.parse(r.b.toString()); info = JSON.stringify([...new Set(j.map(g => g.forecastHour + "@" + g.validTime))]) + " n=" + j.length + " hazards=" + [...new Set(j.map(g => g.hazard))]; } catch {}
  console.log("JSON", q, r.s, info);
  await new Promise(s => setTimeout(s, 1500));
}
const c = await get("https://aviationweather.gov/data/cache/gairmets.cache.xml.gz");
const x = gunzipSync(c.b).toString();
console.log("XML", c.s, x.length, "chars; GAIRMET count", (x.match(/<GAIRMET>/g) || []).length);
console.log("valid_times", [...new Set([...x.matchAll(/<valid_time>([^<]+)</g)].map(m => m[1]))]);
console.log("hazards", [...new Set([...x.matchAll(/<hazard[^>]*>/g)].map(m => m[0]))]);
const k = x.indexOf("<GAIRMET>"); console.log(x.slice(k, k + 1600));
