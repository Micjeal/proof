import { getStore } from "@netlify/blobs";

const store = getStore("pageviews");

const safeNumber = (value) => (Number.isFinite(value) ? value : 0);

export default async (request) => {
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

  const existing = await store.get("stats", { type: "json" });
  const stats = existing && typeof existing === "object" ? existing : { total: 0, pages: {} };

  stats.total = safeNumber(stats.total) + 1;
  stats.pages = stats.pages && typeof stats.pages === "object" ? stats.pages : {};
  stats.pages[path] = safeNumber(stats.pages[path]) + 1;

  await store.setJSON("stats", stats);

  return new Response(
    JSON.stringify({
      total: stats.total,
      path,
      pathCount: stats.pages[path],
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};
