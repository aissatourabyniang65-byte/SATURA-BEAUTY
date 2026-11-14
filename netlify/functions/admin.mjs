import { reviews, json, adminOk } from "../lib/shared.mjs";

export default async (req) => {
  if (!adminOk(req)) return json({ error: "Mot de passe incorrect" }, 401);

  if (req.method === "GET") {
    const store = reviews();
    const { blobs } = await store.list({ prefix: "pending/" });
    const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    const pending = all.filter(Boolean).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return json({ pending });
  }

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
    if (b.action === "approve-review" || b.action === "delete-review") {
      const key = `pending/${String(b.id).replace(/[^A-Z0-9]/gi, "")}`;
      const r = await reviews().get(key, { type: "json" });
      if (!r) return json({ error: "Avis introuvable" }, 404);
      if (b.action === "approve-review") await reviews().setJSON(`approved/${r.id}`, r);
      await reviews().delete(key);
      return json({ ok: true });
    }
  }
  return json({ error: "Requête inconnue" }, 400);
};

export const config = { path: "/api/admin" };
