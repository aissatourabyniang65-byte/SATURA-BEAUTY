import { getStore } from "@netlify/blobs";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";

/* =====================================================================
   CONFIGURATION DE LA BOUTIQUE  (modifie ici, puis republie le site)
   ===================================================================== */

export const STORE = {
  name: "SATURA BEAUTY",
  tagline: "Votre rituel beauté",
  phone: "786501769",
};

// Prix en F CFA. Le serveur recalcule TOUJOURS le total à partir de cette
// liste : un client ne peut pas modifier un prix depuis son navigateur.
export const CATALOG = [
  {
    id: "gommage-radiance-glow",
    name: "Gommage Radiance Glow",
    category: "corps",
    price: 5000,
    image: "images/gommage-radiance-glow.jpg",
    desc: "Révélez une peau douce, lisse et lumineuse. Aide à éliminer les cellules mortes et à affiner le grain de peau.",
    usage: "Appliquer sur peau humide, masser délicatement puis rincer. 1 à 2 fois par semaine. Éviter les zones irritées.",
  },
  {
    id: "savon-corps-lena",
    name: "Savon de corps Lena",
    category: "corps",
    price: 5000,
    image: "images/savon-corps-lena.jpg",
    desc: "Un savon de corps qui nettoie en douceur et laisse la peau fraîche et agréable au toucher.",
    usage: "Appliquer sur peau humide, faire mousser puis rincer abondamment. Usage externe uniquement.",
  },
  {
    id: "savon-collagene-grasse",
    name: "Savon Collagène Grassé",
    category: "visage",
    price: 5000,
    image: "images/savon-collagene-grasse.jpg",
    desc: "Un savon visage pensé pour les peaux grasses, pour un teint net et un moment de pureté.",
    usage: "Appliquer sur visage humide, masser doucement puis rincer. Éviter le contour des yeux.",
  },
  {
    id: "lait-corps-glow-shine",
    name: "Lait de corps Glow Shine",
    category: "corps",
    price: 8000,
    image: "images/lait-corps-glow-shine.jpg",
    desc: "Enveloppez votre peau d'un voile de douceur : nourrit, hydrate et laisse un toucher souple et confortable.",
    usage: "Appliquer sur peau propre et sèche en massant jusqu'à absorption. Usage externe uniquement.",
  },
  {
    id: "savon-visage-correcteur",
    name: "Savon de visage Correcteur",
    category: "visage",
    price: 2000,
    image: "images/savon-visage-correcteur.jpg",
    desc: "Un savon visage au quotidien pour nettoyer la peau et préparer le reste de votre routine.",
    usage: "Appliquer sur visage humide, faire mousser, rincer. Tester sur une petite zone avant la première utilisation.",
  },
  {
    id: "creme-visage",
    name: "Crème de visage",
    category: "visage",
    price: 3500,
    image: "images/creme-visage.jpg",
    desc: "Texture agréable qui aide à hydrater la peau et à préserver sa douceur et son éclat naturel. Utilisation le soir.",
    usage: "Appliquer une petite quantité sur le visage propre et sec, le soir. Usage externe uniquement.",
  },
];

// ⚠️ FRAIS DE LIVRAISON : valeurs PROVISOIRES, à remplacer par tes vrais tarifs.
export const DELIVERY = [
  { id: "dakar", label: "Dakar", fee: 1500 },
  { id: "banlieue", label: "Pikine / Guédiawaye / Rufisque", fee: 2000 },
  { id: "regions", label: "Autres régions du Sénégal", fee: 3000 },
];

// Avis déjà présents sur l'ancien site (modifie / supprime si besoin).
export const SEED_REVIEWS = [
  { id: "seed-1", name: "Fatou B.", city: "Dakar", rating: 5, text: "Le gommage est incroyable, ma peau est douce et lumineuse !", verified: true },
  { id: "seed-2", name: "Awa D.", city: "Pikine", rating: 5, text: "J'adore le savon Lena, il nettoie parfaitement.", verified: true },
  { id: "seed-3", name: "Mariama K.", city: "Guédiawaye", rating: 5, text: "La crème de visage donne vraiment de l'éclat.", verified: true },
];

/* ===================================================================== */

export const orders = () => getStore({ name: "orders", consistency: "strong" });
export const reviews = () => getStore({ name: "reviews", consistency: "strong" });

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const clean = (v, max) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Numéros sénégalais : 77, 78, 76, 75, 70 + 7 chiffres (avec ou sans +221)
export function normalizePhone(raw) {
  const d = String(raw ?? "").replace(/[^\d]/g, "").replace(/^(00)?221/, "");
  return /^7[05678]\d{7}$/.test(d) ? d : null;
}

export function newCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

export function adminOk(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const given = req.headers.get("x-admin-password") || "";
  if (!expected || expected.length < 8) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function siteUrl(req) {
  return (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
}

/* ----------------------------- PayDunya ------------------------------ */

function pdBase() {
  return process.env.PAYDUNYA_MODE === "live"
    ? "https://app.paydunya.com/api/v1"
    : "https://app.paydunya.com/sandbox-api/v1";
}
function pdHeaders() {
  return {
    "content-type": "application/json",
    "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY || "",
    "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY || "",
    "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN || "",
  };
}

export async function pdCreateInvoice(body) {
  const r = await fetch(`${pdBase()}/checkout-invoice/create`, {
    method: "POST",
    headers: pdHeaders(),
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function pdConfirm(token) {
  const r = await fetch(`${pdBase()}/checkout-invoice/confirm/${encodeURIComponent(token)}`, {
    headers: pdHeaders(),
  });
  return r.json();
}

/**
 * Vérifie auprès de PayDunya (jamais à partir de ce que le navigateur ou
 * le webhook affirme) que la commande est bien payée, avec le bon montant.
 */
export async function settleOrder(code) {
  const store = orders();
  const order = await store.get(code, { type: "json" });
  if (!order) return null;
  if (order.status !== "pending" || !order.pdToken) return order;

  let res;
  try {
    res = await pdConfirm(order.pdToken);
  } catch {
    return order;
  }
  const status = String(res?.status || "").toLowerCase();
  const paidAmount = Number(res?.invoice?.total_amount ?? res?.total_amount ?? order.total);

  if (status === "completed" && paidAmount === order.total) {
    order.status = "paid";
    order.paidAt = new Date().toISOString();
    await store.setJSON(code, order);
  } else if (status === "cancelled" || status === "failed") {
    order.status = "failed";
    await store.setJSON(code, order);
  }
  return order;
}
