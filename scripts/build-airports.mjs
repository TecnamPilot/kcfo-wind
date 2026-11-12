// Builds airports.json: every open US airport with runways, from OurAirports (public domain,
// https://github.com/davidmegginson/ourairports-data). The app reads it to show any airport.
// Usage: npm i geomagnetism csv-parse && node scripts/build-airports.mjs <dir with airports.csv and runways.csv>
//
// Output: { "KCFO": [name, lat, lon, elevFt, magVarE, [[le, leTrue, he, heTrue, lengthFt, surface, src], ...]], ... ,
//           "_alias": { "CFO": "KCFO", ... } }
// src says where the true heading came from: "T" = OurAirports true heading, "C" = computed from the
// two runway-end coordinates, "M" = runway number x 10 plus the magnetic variation (least exact, about ±5°).
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import geomagnetism from "geomagnetism";

const dir = process.argv[2] || ".";
const read = f => parse(readFileSync(`${dir}/${f}`), { columns: true, skip_empty_lines: true });
const airports = read("airports.csv"), runways = read("runways.csv");
const model = geomagnetism.model(new Date());
const r6 = v => Math.round(v * 1e4) / 1e4;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
const byAirport = new Map();
for (const r of runways) {
  if (r.closed === "1") continue;
  (byAirport.get(r.airport_ident) || byAirport.set(r.airport_ident, []).get(r.airport_ident)).push(r);
}
const out = {}, alias = {};
let n = 0;
for (const a of airports) {
  if (a.iso_country !== "US" || !/^(small|medium|large)_airport$/.test(a.type)) continue;
  const lat = +a.latitude_deg, lon = +a.longitude_deg;
  const mv = Math.round(model.point([lat, lon]).decl * 10) / 10;
  const rws = [];
  for (const r of byAirport.get(a.ident) || []) {
    const num = s => { const m = /^(\d{1,2})[LRC]?$/.exec(s || ""); return m ? +m[1] : null; };
    const ln = num(r.le_ident), hn = num(r.he_ident);
    if (ln == null) continue;                       // water lanes, "N/S", helipads
    let lt = parseFloat(r.le_heading_degT), ht = parseFloat(r.he_heading_degT), src = "T";
    if (!isFinite(lt)) {
      const c = [r.le_latitude_deg, r.le_longitude_deg, r.he_latitude_deg, r.he_longitude_deg].map(parseFloat);
      if (c.every(isFinite) && (c[0] !== c[2] || c[1] !== c[3])) { lt = bearing(c[0], c[1], c[2], c[3]); src = "C"; }
      else { lt = (ln * 10 + mv + 360) % 360; src = "M"; }
    }
    if (!isFinite(ht)) ht = (lt + 180) % 360;
    rws.push([r.le_ident, Math.round(lt) || 360, r.he_ident || String(hn ?? ""), Math.round(ht) || 360, +r.length_ft || 0, (r.surface || "").slice(0, 12), src]);
  }
  if (!rws.length) continue;
  const code = (a.icao_code || a.gps_code || a.ident).toUpperCase();
  out[code] = [a.name, r6(lat), r6(lon), a.elevation_ft === "" ? null : +a.elevation_ft, mv, rws];
  for (const al of [a.ident, a.local_code, a.gps_code, a.icao_code, a.iata_code]) {
    const k = (al || "").toUpperCase();
    if (k && k !== code && !alias[k]) alias[k] = code;
  }
  n++;
}
for (const k of Object.keys(alias)) if (out[k]) delete alias[k];
out._alias = alias;
out._built = new Date().toISOString().slice(0, 10);
writeFileSync("airports.json", JSON.stringify(out));
console.log(`${n} airports`);
