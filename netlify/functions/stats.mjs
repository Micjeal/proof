import { getStore } from "@netlify/blobs";

const store = getStore("pageviews");

export default async () => {
  const existing = await store.get("stats", { type: "json" });
  const stats = existing && typeof existing === "object" ? existing : { total: 0, pages: {} };

  return new Response(JSON.stringify(stats), {
    headers: { "Content-Type": "application/json" },
  });
};
