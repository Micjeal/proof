import { getStore } from "@netlify/blobs";

const store = getStore("pageviews");

const safeNumber = (value) => (Number.isFinite(value) ? value : 0);

const addMap = (target, source) => {
  if (!source || typeof source !== "object") return;
  Object.entries(source).forEach(([key, value]) => {
    target[key] = safeNumber(target[key]) + safeNumber(value);
  });
};

const dateKey = (date) => date.toISOString().slice(0, 10);

const parseRange = (rangeParam) => {
  if (!rangeParam) return { mode: "all", days: null };
  if (rangeParam === "today") return { mode: "range", days: 1 };
  if (rangeParam === "all") return { mode: "all", days: null };
  const asNumber = Number.parseInt(rangeParam, 10);
  if (Number.isFinite(asNumber) && asNumber > 0) return { mode: "range", days: asNumber };
  return { mode: "all", days: null };
};

export default async (request) => {
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
          referrers: {},
          landings: {},
          errors404: {},
          recent: [],
          daily: {},
        };

  const url = new URL(request.url);
  const { mode, days } = parseRange(url.searchParams.get("range"));
  const daily = stats.daily && typeof stats.daily === "object" ? stats.daily : {};
  const dayKeys = Object.keys(daily).sort();

  let selectedKeys = dayKeys;
  let rangeStart = null;
  let rangeEnd = null;

  if (mode === "range" && days) {
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - (days - 1));
    rangeStart = dateKey(start);
    rangeEnd = dateKey(today);
    selectedKeys = dayKeys.filter((key) => key >= rangeStart && key <= rangeEnd);
  } else if (dayKeys.length > 0) {
    rangeStart = dayKeys[0];
    rangeEnd = dayKeys[dayKeys.length - 1];
  }

  const aggregate = {
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
    uniqueVisitors: 0,
    avgSessionDuration: 0,
    sessionCount: 0,
  };

  const uniqueSet = new Set();
  let totalDuration = 0;
  let totalSessions = 0;

  selectedKeys.forEach((key) => {
    const day = daily[key];
    if (!day || typeof day !== "object") return;
    aggregate.pageviews += safeNumber(day.pageviews);
    addMap(aggregate.pages, day.pages);
    addMap(aggregate.countries, day.countries);
    addMap(aggregate.regions, day.regions);
    addMap(aggregate.cities, day.cities);
    addMap(aggregate.timezones, day.timezones);
    addMap(aggregate.devices, day.devices);
    addMap(aggregate.os, day.os);
    addMap(aggregate.browsers, day.browsers);
    addMap(aggregate.referrers, day.referrers);
    addMap(aggregate.landings, day.landings);
    addMap(aggregate.errors404, day.errors404);

    if (day.uniqueIds && typeof day.uniqueIds === "object") {
      Object.keys(day.uniqueIds).forEach((id) => uniqueSet.add(id));
    }

    if (day.sessions && typeof day.sessions === "object") {
      Object.values(day.sessions).forEach((session) => {
        if (!session || typeof session !== "object") return;
        const start = safeNumber(session.start);
        const end = safeNumber(session.end) || start;
        if (!start) return;
        totalDuration += Math.max(0, end - start);
        totalSessions += 1;
      });
    }
  });

  aggregate.uniqueVisitors = uniqueSet.size;
  aggregate.sessionCount = totalSessions;
  aggregate.avgSessionDuration = totalSessions ? Math.round((totalDuration / totalSessions) / 1000) : 0;

  if (selectedKeys.length === 0 && mode === "all") {
    aggregate.pageviews = safeNumber(stats.total);
    aggregate.pages = stats.pages || {};
    aggregate.countries = stats.countries || {};
    aggregate.regions = stats.regions || {};
    aggregate.cities = stats.cities || {};
    aggregate.timezones = stats.timezones || {};
    aggregate.devices = stats.devices || {};
    aggregate.os = stats.os || {};
    aggregate.browsers = stats.browsers || {};
    aggregate.referrers = stats.referrers || {};
    aggregate.landings = stats.landings || {};
    aggregate.errors404 = stats.errors404 || {};
  }

  const recent = Array.isArray(stats.recent) ? stats.recent : [];
  let recentFiltered = recent;
  if (mode === "range" && rangeStart && rangeEnd) {
    const startDate = new Date(`${rangeStart}T00:00:00Z`).getTime();
    const endDate = new Date(`${rangeEnd}T23:59:59Z`).getTime();
    recentFiltered = recent.filter((item) => {
      const time = item && item.time ? new Date(item.time).getTime() : 0;
      return time >= startDate && time <= endDate;
    });
  }

  return new Response(
    JSON.stringify({
      range: mode === "range" && days ? `${days}` : "all",
      rangeStart,
      rangeEnd,
      generatedAt: new Date().toISOString(),
      ...aggregate,
      recent: recentFiltered.slice(0, 25),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
