import { orders, settleOrder } from "../lib/shared.mjs";

// Webhook appelé par PayDunya après un paiement.
// On n'accorde AUCUNE confiance au contenu reçu : on en extrait seulement le
// jeton de facture, puis on demande à PayDunya lui-même si c'est payé.
export default async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const raw = await req.text();
  let token = null;

  try {
    const params = new URLSearchParams(raw);
    for (const [k, v] of params) {
      if (/token/i.test(k) && /invoice/i.test(k)) token = v;
    }
    if (!token) {
      const j = JSON.parse(raw);
      token = j?.data?.invoice?.token || j?.invoice?.token || null;
    }
  } catch { /* on tente la regex ci-dessous */ }

  if (!token) {
    const m = raw.match(/invoice\]?\[?"?\]?[^a-z0-9]{0,8}token[^A-Za-z0-9]{1,8}([A-Za-z0-9_-]{8,})/i);
    token = m ? m[1] : null;
  }
  if (!token) return new Response("no token", { status: 400 });

  const code = await orders().get(`token-${token}`);
  if (code) await settleOrder(code);
  return new Response("ok");
};

export const config = { path: "/api/payment-callback" };
