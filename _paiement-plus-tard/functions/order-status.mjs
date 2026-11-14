import { json, settleOrder } from "../lib/shared.mjs";

export default async (req) => {
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code || code.length !== 8) return json({ error: "Code invalide" }, 400);

  const order = await settleOrder(code); // revérifie auprès de PayDunya si encore en attente
  if (!order) return json({ error: "Commande introuvable" }, 404);

  // Aucune donnée personnelle renvoyée ici
  return json({
    code: order.code,
    status: order.status,
    total: order.total,
    items: order.items.map((i) => ({ name: i.name, qty: i.qty })),
  });
};

export const config = { path: "/api/order-status" };
