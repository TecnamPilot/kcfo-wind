// Temporary diagnostic: which aviationweather.gov requests does the GitHub runner get through?
const urls = [
  "https://aviationweather.gov/api/data/gairmet?format=json",
  "https://aviationweather.gov/api/data/gairmet",
  "https://aviationweather.gov/data/cache/gairmets.cache.xml.gz",
  "https://aviationweather.gov/data/cache/aircraftreports.cache.csv.gz",
  "https://aviationweather.gov/api/data/metar?ids=KDEN&format=json",
];
const agents = { custom: "kcfo-wind/1.0 (personal flight-planning page)", short: "kcfo-wind", nodeDefault: null };
for (const [name, ua] of Object.entries(agents)) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: ua ? { "User-Agent": ua, Accept: "*/*" } : {}, signal: AbortSignal.timeout(20000) });
      const body = r.ok ? `${(await r.arrayBuffer()).byteLength} bytes` : (await r.text()).replace(/\s+/g, " ").slice(0, 200);
      console.log(`[${name}] ${r.status} ${u} | server=${r.headers.get("server")} | ${body}`);
    } catch (e) { console.log(`[${name}] ERROR ${u} | ${e.message}`); }
    await new Promise(s => setTimeout(s, 1500));
  }
}
