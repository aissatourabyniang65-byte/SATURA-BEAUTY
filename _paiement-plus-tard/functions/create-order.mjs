import {
  CATALOG, DELIVERY, STORE, orders, json, clean, normalizePhone, newCode, siteUrl, pdCreateInvoice,
} from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }

  // Anti-spam : champ caché que seuls les robots remplissent
  if (body.website) return json({ error: "Requête refusée" }, 400);

  const name = clean(body.name, 80);
  const phone = normalizePhone(body.phone);
  const address = clean(body.address, 200);
  const note = clean(body.note, 300);
  const zone = DELIVERY.find((z) => z.id === body.zone);

  if (name.length < 2) return json({ error: "Merci d'indiquer ton nom." }, 400);
  if (!phone) return json({ error: "Numéro invalide. Exemple : 77 123 45 67." }, 400);
  if (!zone) return json({ error: "Choisis ta zone de livraison." }, 400);
  if (address.length < 5) return json({ error: "Merci d'indiquer ton adresse de livraison." }, 400);

  // Le panier vient du navigateur, mais prix et noms viennent du serveur.
  const lines = [];
  for (const it of Array.isArray(body.items) ? body.items.slice(0, 30) : []) {
    const p = CATALOG.find((x) => x.id === it.id);
    const qty = Math.floor(Number(it.qty));
    if (!p || !(qty >= 1 && qty <= 20)) continue;
    lines.push({ id: p.id, name: p.name, qty, unit: p.price, total: p.price * qty });
  }
  if (!lines.length) return json({ error: "Ton panier est vide." }, 400);

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const total = subtotal + zone.fee;
  const code = newCode();
  const site = siteUrl(req);

  const items = {};
  lines.forEach((l, i) => {
    items[`item_${i}`] = {
      name: l.name, quantity: l.qty, unit_price: l.unit, total_price: l.total, description: l.name,
    };
  });
  items[`item_${lines.length}`] = {
    name: `Livraison (${zone.label})`, quantity: 1, unit_price: zone.fee, total_price: zone.fee, description: "Frais de livraison",
  };

  let invoice;
  try {
    invoice = await pdCreateInvoice({
      invoice: { items, total_amount: total, description: `Commande ${code} - ${STORE.name}` },
      store: { name: STORE.name, tagline: STORE.tagline, phone: STORE.phone, website_url: site },
      actions: {
        cancel_url: `${site}/merci.html?order=${code}&cancel=1`,
        return_url: `${site}/merci.html?order=${code}`,
        callback_url: `${site}/api/payment-callback`,
      },
      custom_data: { order_code: code },
    });
  } catch {
    return json({ error: "Le service de paiement ne répond pas. Réessaie dans un instant." }, 502);
  }

  if (invoice?.response_code !== "00" || !invoice?.token || !invoice?.response_text) {
    console.error("PayDunya create failed:", invoice?.response_code, invoice?.response_text);
    return json({ error: "Paiement indisponible pour le moment. Réessaie plus tard." }, 502);
  }

  const store = orders();
  await store.setJSON(code, {
    code, status: "pending", createdAt: new Date().toISOString(),
    customer: { name, phone, address, note }, zone: zone.label,
    items: lines, subtotal, deliveryFee: zone.fee, total, pdToken: invoice.token,
  });
  await store.set(`token-${invoice.token}`, code); // pour retrouver la commande depuis le webhook

  return json({ checkoutUrl: invoice.response_text, code });
};

export const config = { path: "/api/create-order" };
