import { CATALOG, DELIVERY, STORE, json } from "../lib/shared.mjs";

export default async () =>
  new Response(JSON.stringify({ store: STORE, products: CATALOG, delivery: DELIVERY }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
  });

export const config = { path: "/api/catalog" };
