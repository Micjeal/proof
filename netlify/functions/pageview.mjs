import { getStore } from "@netlify/blobs";

const store = getStore("pageviews");
const MAX_RECENT = 25;

const safeNumber = (value) => (Number.isFinite(value) ? value : 0);
const normalizeKey = (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null);

const increment = (map, key) => {
  if (!key) return;
  map[key] = safeNumber(map[key]) + 1;
};

const parseDevice = (userAgent) => {
  const ua = (userAgent || "").toLowerCase();
  const isBot = /bot|crawl|spider|slurp|preview|facebookexternalhit|pingdom|headless|prerender/.test(ua);
  const isTablet = /tablet|ipad/.test(ua);
  const isMobile = /mobi|android|iphone|ipod|windows phone/.test(ua);
  const device = isBot ? "Bot" : isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";

  let os = "Other";
  if (/windows nt/.test(ua)) os = "Windows";
  else if (/android/.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/.test(ua)) os = "macOS";
  else if (/linux/.test(ua)) os = "Linux";

  let browser = "Other";
  if (/edg\//.test(ua)) browser = "Edge";
  else if (/opr\/|opera/.test(ua)) browser = "Opera";
  else if (/chrome|crios/.test(ua) && !/edg\//.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/.test(ua)) browser = "Firefox";
  else if (/safari/.test(ua) && !/chrome|crios|edg\//.test(ua)) browser = "Safari";

  return { device, os, browser };
};

export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const path =
    typeof payload.path === "string" && payload.path.trim().length > 0
      ? payload.path.trim()
      : "unknown";

  const geo = context && context.geo ? context.geo : {};
  const countryName = geo?.country?.name || null;
  const countryCode = geo?.country?.code || null;
  const regionName = geo?.subdivision?.name || null;
  const cityName = geo?.city || null;
  const timezone = geo?.timezone || null;

  const countryLabel = normalizeKey(
    countryName && countryCode ? `${countryName} (${countryCode})` : countryName || countryCode
  );
  const regionLabel = normalizeKey(
    regionName && countryName ? `${regionName}, ${countryName}` : regionName
  );
  const cityLabel = normalizeKey(
    cityName
      ? `${cityName}${regionName ? `, ${regionName}` : ""}${countryName ? `, ${countryName}` : ""}`
      : null
  );

  const userAgent = request.headers.get("user-agent") || "";
  const { device, os, browser } = parseDevice(userAgent);

  const existing = await store.get("stats", { type: "json" });
  const stats =
    existing && typeof existing === "object"
      ? existing
      : {
          total: 0,
          pages: {},
          countries: {},
          regions: {},
          cities: {},
          timezones: {},
          devices: {},
          os: {},
          browsers: {},
          recent: [],
        };

  stats.total = safeNumber(stats.total) + 1;
  stats.pages = stats.pages && typeof stats.pages === "object" ? stats.pages : {};
  stats.countries = stats.countries && typeof stats.countries === "object" ? stats.countries : {};
  stats.regions = stats.regions && typeof stats.regions === "object" ? stats.regions : {};
  stats.cities = stats.cities && typeof stats.cities === "object" ? stats.cities : {};
  stats.timezones = stats.timezones && typeof stats.timezones === "object" ? stats.timezones : {};
  stats.devices = stats.devices && typeof stats.devices === "object" ? stats.devices : {};
  stats.os = stats.os && typeof stats.os === "object" ? stats.os : {};
  stats.browsers = stats.browsers && typeof stats.browsers === "object" ? stats.browsers : {};
  stats.recent = Array.isArray(stats.recent) ? stats.recent : [];

  increment(stats.pages, path);
  increment(stats.countries, countryLabel || "Unknown");
  if (regionLabel) increment(stats.regions, regionLabel);
  if (cityLabel) increment(stats.cities, cityLabel);
  if (timezone) increment(stats.timezones, timezone);
  increment(stats.devices, device);
  increment(stats.os, os);
  increment(stats.browsers, browser);

  stats.recent.unshift({
    time: new Date().toISOString(),
    path,
    country: countryLabel || "Unknown",
    region: regionLabel || "Unknown",
    city: cityLabel || "Unknown",
    timezone: timezone || "Unknown",
    device,
    os,
    browser,
  });
  stats.recent = stats.recent.slice(0, MAX_RECENT);

  await store.setJSON("stats", stats);

  return new Response(
    JSON.stringify({
      total: stats.total,
      path,
      pathCount: stats.pages[path],
      country: countryLabel || "Unknown",
      device,
      os,
      browser,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
