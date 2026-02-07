import crypto from "crypto";
import { getStore } from "@netlify/blobs";

const store = getStore("pageviews");
const MAX_RECENT = 25;
const RETENTION_DAYS = 90;

const safeNumber = (value) => (Number.isFinite(value) ? value : 0);
const normalizeKey = (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null);

const increment = (map, key, amount = 1) => {
  if (!key) return;
  map[key] = safeNumber(map[key]) + amount;
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

const getClientIp = (request, context) => {
  const contextIp = context && typeof context.ip === "string" ? context.ip : null;
  const headerIp =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("client-ip");
  const raw = contextIp || headerIp;
  if (!raw) return null;
  return raw.split(",")[0].trim();
};

const classifyReferrer = (referrer, host) => {
  if (!referrer) {
    return { category: "Direct", domain: "Direct" };
  }

  let url;
  try {
    url = new URL(referrer);
  } catch {
    return { category: "Direct", domain: "Direct" };
  }

  const refHost = url.hostname.replace(/^www\./, "");
  const baseHost = (host || "").replace(/^www\./, "");
  if (baseHost && refHost === baseHost) {
    return { category: "Direct", domain: refHost || "Direct" };
  }

  if (/google\./.test(refHost)) return { category: "Google", domain: refHost };
  if (/bing\./.test(refHost)) return { category: "Bing", domain: refHost };
  if (/duckduckgo\./.test(refHost)) return { category: "DuckDuckGo", domain: refHost };
  if (/yahoo\./.test(refHost)) return { category: "Yahoo", domain: refHost };
  if (/linkedin\./.test(refHost)) return { category: "LinkedIn", domain: refHost };
  if (/facebook\./.test(refHost) || /fb\./.test(refHost)) return { category: "Facebook", domain: refHost };
  if (/instagram\./.test(refHost)) return { category: "Instagram", domain: refHost };
  if (/twitter\./.test(refHost) || /t\.co/.test(refHost) || /x\.com/.test(refHost)) {
    return { category: "X (Twitter)", domain: refHost };
  }
  if (/github\./.test(refHost)) return { category: "GitHub", domain: refHost };
  if (/whatsapp\./.test(refHost) || /wa\.me/.test(refHost)) return { category: "WhatsApp", domain: refHost };
  if (/tiktok\./.test(refHost)) return { category: "TikTok", domain: refHost };

  return { category: refHost || "Other", domain: refHost || "Other" };
};

const dateKeyFrom = (timestamp) => {
  const date = new Date(timestamp);
  return date.toISOString().slice(0, 10);
};

const defaultStats = () => ({
  total: 0,
  pages: {},
  countries: {},
  regions: {},
  cities: {},
  timezones: {},
  devices: {},
  os: {},
  browsers: {},
  referrers: {},
  landings: {},
  errors404: {},
  recent: [],
  daily: {},
});

const defaultDaily = () => ({
  pageviews: 0,
  pages: {},
  countries: {},
  regions: {},
  cities: {},
  timezones: {},
  devices: {},
  os: {},
  browsers: {},
  referrers: {},
  landings: {},
  errors404: {},
  uniques: 0,
  uniqueIds: {},
  sessions: {},
});

const pruneDaily = (daily) => {
  const keys = Object.keys(daily).sort();
  if (keys.length <= RETENTION_DAYS) return;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS + 1);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  keys.forEach((key) => {
    if (key < cutoffKey) {
      delete daily[key];
    }
  });
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
  const eventType = payload.event === "404" ? "404" : payload.event === "session_end" ? "session_end" : "pageview";
  const timestamp = Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now();
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
  const landing = typeof payload.landing === "string" ? payload.landing.trim() : null;
  const referrer = typeof payload.referrer === "string" ? payload.referrer.trim() : "";
  const host = typeof payload.host === "string" ? payload.host.trim() : "";

  const geo = context && context.geo ? context.geo : {};
  const countryName = geo?.country?.name || null;
  const countryCode = geo?.country?.code || null;
  const regionName = geo?.subdivision?.name || null;
  const cityName = geo?.city || null;
  const timezone = geo?.timezone || null;

  const countryLabel = normalizeKey(
    countryName && countryCode ? `${countryName} (${countryCode})` : countryName || countryCode
  );
  const regionLabel = normalizeKey(regionName && countryName ? `${regionName}, ${countryName}` : regionName);
  const cityLabel = normalizeKey(
    cityName
      ? `${cityName}${regionName ? `, ${regionName}` : ""}${countryName ? `, ${countryName}` : ""}`
      : null
  );

  const userAgent = request.headers.get("user-agent") || "";
  const { device, os, browser } = parseDevice(userAgent);
  const clientIp = getClientIp(request, context);
  const visitorHash = clientIp || userAgent ? crypto.createHash("sha256").update(`${clientIp || ""}|${userAgent}`).digest("hex") : null;
  const referrerInfo = classifyReferrer(referrer, host);
  const dayKey = dateKeyFrom(timestamp);

  const existing = await store.get("stats", { type: "json" });
  const stats = existing && typeof existing === "object" ? existing : defaultStats();

  stats.pages = stats.pages && typeof stats.pages === "object" ? stats.pages : {};
  stats.countries = stats.countries && typeof stats.countries === "object" ? stats.countries : {};
  stats.regions = stats.regions && typeof stats.regions === "object" ? stats.regions : {};
  stats.cities = stats.cities && typeof stats.cities === "object" ? stats.cities : {};
  stats.timezones = stats.timezones && typeof stats.timezones === "object" ? stats.timezones : {};
  stats.devices = stats.devices && typeof stats.devices === "object" ? stats.devices : {};
  stats.os = stats.os && typeof stats.os === "object" ? stats.os : {};
  stats.browsers = stats.browsers && typeof stats.browsers === "object" ? stats.browsers : {};
  stats.referrers = stats.referrers && typeof stats.referrers === "object" ? stats.referrers : {};
  stats.landings = stats.landings && typeof stats.landings === "object" ? stats.landings : {};
  stats.errors404 = stats.errors404 && typeof stats.errors404 === "object" ? stats.errors404 : {};
  stats.daily = stats.daily && typeof stats.daily === "object" ? stats.daily : {};
  stats.recent = Array.isArray(stats.recent) ? stats.recent : [];

  const dayStats = stats.daily[dayKey] && typeof stats.daily[dayKey] === "object" ? stats.daily[dayKey] : defaultDaily();
  dayStats.pages = dayStats.pages && typeof dayStats.pages === "object" ? dayStats.pages : {};
  dayStats.countries = dayStats.countries && typeof dayStats.countries === "object" ? dayStats.countries : {};
  dayStats.regions = dayStats.regions && typeof dayStats.regions === "object" ? dayStats.regions : {};
  dayStats.cities = dayStats.cities && typeof dayStats.cities === "object" ? dayStats.cities : {};
  dayStats.timezones = dayStats.timezones && typeof dayStats.timezones === "object" ? dayStats.timezones : {};
  dayStats.devices = dayStats.devices && typeof dayStats.devices === "object" ? dayStats.devices : {};
  dayStats.os = dayStats.os && typeof dayStats.os === "object" ? dayStats.os : {};
  dayStats.browsers = dayStats.browsers && typeof dayStats.browsers === "object" ? dayStats.browsers : {};
  dayStats.referrers = dayStats.referrers && typeof dayStats.referrers === "object" ? dayStats.referrers : {};
  dayStats.landings = dayStats.landings && typeof dayStats.landings === "object" ? dayStats.landings : {};
  dayStats.errors404 = dayStats.errors404 && typeof dayStats.errors404 === "object" ? dayStats.errors404 : {};
  dayStats.uniqueIds = dayStats.uniqueIds && typeof dayStats.uniqueIds === "object" ? dayStats.uniqueIds : {};
  dayStats.sessions = dayStats.sessions && typeof dayStats.sessions === "object" ? dayStats.sessions : {};

  const isPageview = eventType !== "session_end";

  if (isPageview) {
    stats.total = safeNumber(stats.total) + 1;
    dayStats.pageviews = safeNumber(dayStats.pageviews) + 1;

    increment(stats.pages, path);
    increment(dayStats.pages, path);

    increment(stats.countries, countryLabel || "Unknown");
    increment(dayStats.countries, countryLabel || "Unknown");
    if (regionLabel) {
      increment(stats.regions, regionLabel);
      increment(dayStats.regions, regionLabel);
    }
    if (cityLabel) {
      increment(stats.cities, cityLabel);
      increment(dayStats.cities, cityLabel);
    }
    if (timezone) {
      increment(stats.timezones, timezone);
      increment(dayStats.timezones, timezone);
    }

    increment(stats.devices, device);
    increment(dayStats.devices, device);
    increment(stats.os, os);
    increment(dayStats.os, os);
    increment(stats.browsers, browser);
    increment(dayStats.browsers, browser);
    increment(stats.referrers, referrerInfo.category);
    increment(dayStats.referrers, referrerInfo.category);

    if (payload.isNewSession && landing) {
      increment(stats.landings, landing);
      increment(dayStats.landings, landing);
    }

    if (eventType === "404") {
      increment(stats.errors404, path);
      increment(dayStats.errors404, path);
    }

    if (visitorHash) {
      if (!dayStats.uniqueIds[visitorHash]) {
        dayStats.uniqueIds[visitorHash] = true;
        dayStats.uniques = safeNumber(dayStats.uniques) + 1;
      }
    }
  }

  if (sessionId) {
    const session = dayStats.sessions[sessionId] || { start: timestamp, end: timestamp, landing: landing || null };
    session.start = Math.min(session.start, timestamp);
    session.end = Math.max(session.end, timestamp);
    if (landing) {
      session.landing = landing;
    }
    dayStats.sessions[sessionId] = session;
  }

  if (isPageview) {
    stats.recent.unshift({
      time: new Date(timestamp).toISOString(),
      event: eventType,
      path,
      country: countryLabel || "Unknown",
      region: regionLabel || "Unknown",
      city: cityLabel || "Unknown",
      timezone: timezone || "Unknown",
      device,
      os,
      browser,
      referrer: referrerInfo.category,
    });
    stats.recent = stats.recent.slice(0, MAX_RECENT);
  }

  stats.daily[dayKey] = dayStats;
  pruneDaily(stats.daily);

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
      referrer: referrerInfo.category,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
