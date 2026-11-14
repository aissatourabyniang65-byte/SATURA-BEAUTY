import { reviews, json, clean, newCode, SEED_REVIEWS } from "../lib/shared.mjs";

async function listByStatus(status) {
  const store = reviews();
  const { blobs } = await store.list({ prefix: `${status}/` });
  const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return all.filter(Boolean).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export default async (req) => {
  /* Public : uniquement les avis validés */
  if (req.method === "GET") {
    const approved = await listByStatus("approved");
    const list = [...approved, ...SEED_REVIEWS].map((r) => ({
      name: r.name, city: r.city, rating: r.rating, text: r.text,
    }));
    const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
    return json({ reviews: list.slice(0, 30), count: list.length, average: Math.round(avg * 10) / 10 });
  }

  /* Envoi d'un avis : il reste "en attente" jusqu'à ta validation */
  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
    if (b.website) return json({ ok: true }); // robot : on fait semblant

    const name = clean(b.name, 60);
    const city = clean(b.city, 60);
    const text = clean(b.text, 500);
    const rating = Math.floor(Number(b.rating));
    if (name.length < 2) return json({ error: "Merci d'indiquer ton prénom." }, 400);
    if (!(rating >= 1 && rating <= 5)) return json({ error: "Choisis une note de 1 à 5." }, 400);
    if (text.length < 10) return json({ error: "Ton avis est un peu court (10 caractères minimum)." }, 400);

    const id = newCode();
    await reviews().setJSON(`pending/${id}`, { id, name, city, rating, text, createdAt: new Date().toISOString() });
    return json({ ok: true });
  }

  return json({ error: "Méthode non autorisée" }, 405);
};

export const config = { path: "/api/reviews" };
