/* SATURA BEAUTY — boutique : catalogue, panier, commande par WhatsApp, avis */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const S = window.SATURA;
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " F CFA";
  const wa = (text) => `https://wa.me/${S.phone}?text=${encodeURIComponent(text)}`;
  const products = S.products;
  const zones = S.delivery;

  let cart = {}; // { productId: qty }
  let view = "cart"; // "cart" | "checkout"
  let form = { name: "", phone: "", zone: "", address: "", note: "" };

  /* ---------- panier (mémorisé sur le téléphone de la cliente) ---------- */
  try {
    const saved = JSON.parse(localStorage.getItem("satura-cart") || "{}");
    if (saved && typeof saved === "object") cart = saved;
  } catch { /* stockage indisponible : le panier reste en mémoire */ }
  for (const id of Object.keys(cart)) if (!products.find((p) => p.id === id)) delete cart[id];
  const saveCart = () => { try { localStorage.setItem("satura-cart", JSON.stringify(cart)); } catch { /* ignore */ } };

  const cartLines = () =>
    Object.entries(cart).map(([id, qty]) => ({ p: products.find((x) => x.id === id), qty })).filter((l) => l.p && l.qty > 0);
  const count = () => cartLines().reduce((s, l) => s + l.qty, 0);
  const subtotal = () => cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);

  function setQty(id, qty) {
    qty = Math.max(0, Math.min(20, qty));
    if (qty === 0) delete cart[id]; else cart[id] = qty;
    saveCart();
    refresh();
  }

  /* ---------- catalogue ---------- */
  function renderGrid(filter = "all") {
    const list = products.filter((p) => filter === "all" || (filter === "fav" ? p.fav : p.category === filter));
    $("#grid").innerHTML = list
      .map(
        (p) => `
      <article class="card">
        <div class="ph" data-initial="${esc(p.name.charAt(0))}">
          <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
        </div>
        <div class="body">
          <h3>${esc(p.name)}</h3>
          <div class="stars">★★★★★ <small style="color:var(--muted);letter-spacing:0">(${p.reviews} avis)</small></div>
          <p>${esc(p.desc)}</p>
          <details><summary>Conseil d'utilisation</summary><p>${esc(p.usage)}</p></details>
          <div class="price">${money(p.price)}</div>
          <button class="btn block" data-add="${esc(p.id)}">Ajouter au panier</button>
        </div>
      </article>`
      )
      .join("");
    if (window.fxReveal) window.fxReveal(document.querySelectorAll("#grid .card"));
    // photo absente : on affiche l'initiale du produit à la place
    document.querySelectorAll("#grid .ph img").forEach((img) => {
      const fallback = () => { img.parentElement.textContent = img.parentElement.dataset.initial; };
      img.addEventListener("error", fallback, { once: true });
      if (img.complete && img.naturalWidth === 0) fallback();
    });
  }

  /* ---------- message WhatsApp ---------- */
  function orderText() {
    const zone = zones.find((z) => z.id === form.zone);
    const lines = cartLines().map(({ p, qty }) => `• ${qty} × ${p.name} — ${money(p.price * qty)}`);
    return [
      "Bonjour SATURA BEAUTY, je souhaite commander :",
      "",
      ...lines,
      "",
      `Sous-total : ${money(subtotal())} (hors livraison)`,
      "",
      `Nom : ${form.name.trim()}`,
      `Téléphone : ${form.phone.trim()}`,
      `Zone : ${zone ? zone.label : ""}`,
      `Adresse : ${form.address.trim()}`,
      form.note.trim() ? `Précision : ${form.note.trim()}` : null,
      "",
      "Merci de me confirmer les frais de livraison et le paiement (Wave ou Orange Money).",
    ].filter((l) => l !== null).join("\n");
  }

  function formError() {
    if (form.name.trim().length < 2) return "Merci d'indiquer ton nom.";
    if (form.phone.replace(/\D/g, "").length < 9) return "Merci d'indiquer ton numéro de téléphone.";
    if (!form.zone) return "Choisis ta zone de livraison.";
    if (form.address.trim().length < 5) return "Merci d'indiquer ton adresse de livraison.";
    return "";
  }

  /* ---------- tiroir panier ---------- */
  function openDrawer(v) {
    if (v) view = v;
    $("#drawer").classList.add("open");
    $("#overlay").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    renderDrawer();
  }
  function closeDrawer() {
    $("#drawer").classList.remove("open");
    $("#overlay").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
  }

  function renderDrawer() {
    const body = $("#drawerBody");
    const lines = cartLines();
    $("#drawerTitle").textContent = view === "checkout" ? "Finaliser ma commande" : "Mon panier";

    if (!lines.length) {
      view = "cart";
      $("#drawerTitle").textContent = "Mon panier";
      body.innerHTML = `<div class="empty">Ton panier est vide.<br><br><a class="btn" href="#produits" id="goShop">Voir les produits</a></div>`;
      return;
    }

    const linesHtml = lines
      .map(
        ({ p, qty }) => `
      <div class="line">
        <b>${esc(p.name)}</b><b>${money(p.price * qty)}</b>
        <div class="qty" data-id="${esc(p.id)}">
          <button data-dec aria-label="Moins">−</button><span>${qty}</span><button data-inc aria-label="Plus">+</button>
        </div>
        <button class="rm" data-rm="${esc(p.id)}">Retirer</button>
      </div>`
      )
      .join("");

    const sumHtml = `
      <div class="sum">
        <div><span>Sous-total</span><span>${money(subtotal())}</span></div>
        <div><span>Livraison</span><span>confirmée sur WhatsApp</span></div>
      </div>`;

    if (view === "cart") {
      body.innerHTML = `${linesHtml}${sumHtml}
        <button class="btn block" id="toCheckout">Commander</button>`;
      return;
    }

    body.innerHTML = `${linesHtml}
      <form class="form" id="orderForm" novalidate>
        <label>Nom complet<input name="name" maxlength="80" required autocomplete="name" value="${esc(form.name)}"></label>
        <label>Téléphone<input name="phone" type="tel" inputmode="tel" maxlength="20" required autocomplete="tel" placeholder="77 123 45 67" value="${esc(form.phone)}"></label>
        <label>Zone de livraison
          <select name="zone" required>
            <option value="">Choisir…</option>
            ${zones.map((z) => `<option value="${esc(z.id)}" ${z.id === form.zone ? "selected" : ""}>${esc(z.label)}</option>`).join("")}
          </select>
        </label>
        <label>Adresse de livraison<textarea name="address" rows="2" maxlength="200" required placeholder="Quartier, rue, repère…">${esc(form.address)}</textarea></label>
        <label>Précision (facultatif)<input name="note" maxlength="300" value="${esc(form.note)}"></label>
        ${sumHtml}
        <div id="orderMsg"></div>
        <a class="btn block" id="waOrder" target="_blank" rel="noopener" href="${wa("")}">💬 Envoyer ma commande sur WhatsApp</a>
        <a class="btn ghost block" href="tel:+${S.phone}">📞 Appeler pour commander</a>
        <div class="pay-note">Un message est déjà rédigé : tu n'as plus qu'à l'envoyer. Nous confirmons les frais de livraison et le paiement (Wave ou Orange Money).</div>
        <button type="button" class="rm" id="backCart">← Retour au panier</button>
      </form>`;
    updateWaHref();
  }

  function rememberForm() {
    const f = $("#orderForm");
    if (!f) return;
    for (const k of Object.keys(form)) if (f.elements[k]) form[k] = f.elements[k].value;
  }
  function updateWaHref() {
    rememberForm();
    const a = $("#waOrder");
    if (a) a.href = wa(orderText());
  }

  function refresh() {
    const cc = $("#cartCount");
    if (cc.textContent !== String(count())) { cc.classList.remove("bump"); void cc.offsetWidth; cc.classList.add("bump"); }
    cc.textContent = count();
    if ($("#drawer").classList.contains("open")) {
      rememberForm();
      renderDrawer();
    }
  }

  /* ---------- avis ---------- */
  const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

  function showReviews(d) {
    $("#avg").textContent = d.count ? String(d.average).replace(".", ",") : "–";
    $("#avgStars").textContent = stars(Math.round(d.average || 5));
    $("#avgCount").textContent = d.count ? `${d.count} avis` : "";
    $("#reviews").innerHTML = d.reviews
      .map((v) => `
        <div class="rev">
          <div class="stars">${stars(v.rating)}</div>
          <q>${esc(v.text)}</q>
          <small>${esc(v.name)}${v.city ? " · " + esc(v.city) : ""}</small>
        </div>`)
      .join("");
    if (window.fxReveal) window.fxReveal(document.querySelectorAll("#reviews .rev"));
  }

  async function loadReviews() {
    try {
      const r = await fetch("/api/reviews");
      if (!r.ok) throw new Error();
      showReviews(await r.json());
    } catch {
      const list = S.seedReviews; // serveur d'avis indisponible : avis de départ
      showReviews({ reviews: list, count: list.length, average: list.reduce((t, v) => t + v.rating, 0) / list.length });
    }
  }

  let rating = 5;
  function renderStarPick() {
    $("#starpick").innerHTML = [1, 2, 3, 4, 5]
      .map((n) => `<button type="button" role="radio" aria-checked="${n === rating}" aria-label="${n} sur 5" data-n="${n}" class="${n <= rating ? "on" : ""}">★</button>`)
      .join("");
  }

  async function submitReview(e) {
    e.preventDefault();
    const f = e.target;
    const msg = $("#reviewMsg");
    const btn = f.querySelector("button[type=submit]");
    const data = {
      name: f.elements.name.value, city: f.elements.city.value, text: f.elements.text.value,
      website: f.elements.website.value, rating,
    };
    msg.innerHTML = "";
    btn.disabled = true;
    try {
      let r;
      try {
        r = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      } catch { r = null; }
      if (!r || [404, 405, 501, 502, 503].includes(r.status)) {
        // pas de serveur d'avis : on propose l'envoi par WhatsApp
        const t = `Bonjour SATURA BEAUTY, voici mon avis ${stars(rating)} :\n${data.text}\n— ${data.name}${data.city ? ", " + data.city : ""}`;
        msg.innerHTML = `<div class="msg ok">Les avis en ligne ne sont pas encore activés. <a href="${esc(wa(t))}" target="_blank" rel="noopener">Envoyer mon avis par WhatsApp</a></div>`;
        return;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Une erreur est survenue. Réessaie.");
      f.reset();
      rating = 5;
      renderStarPick();
      msg.innerHTML = `<div class="msg ok">Merci ♥ Ton avis sera publié après vérification.</div>`;
    } catch (err) {
      msg.innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- démarrage ---------- */
  function init() {
    window.SaturaShop = { add: (id) => setQty(id, (cart[id] || 0) + 1) }; // utilisé par la vitrine
    renderGrid();
    $("#zones").innerHTML = zones.map((z) => `<span>${esc(z.label)}</span>`).join("");
    renderStarPick();
    $("#cartCount").textContent = count();
    $("#routineLink").href = wa("Bonjour SATURA BEAUTY, j'aimerais trouver ma routine de soins.");
    $("#waFooter").href = wa("Bonjour SATURA BEAUTY, j'ai une question.");
    loadReviews();

    $("#filters").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      document.querySelectorAll("#filters .chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      renderGrid(b.dataset.f);
    });
    $("#grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-add]");
      if (!b) return;
      setQty(b.dataset.add, (cart[b.dataset.add] || 0) + 1);
      b.textContent = "Ajouté ✔";
      setTimeout(() => { b.textContent = "Ajouter au panier"; }, 1200);
    });

    $("#openCart").addEventListener("click", () => openDrawer("cart"));
    $("#openCart2").addEventListener("click", () => openDrawer("cart"));
    $("#closeCart").addEventListener("click", closeDrawer);
    $("#overlay").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

    const body = $("#drawerBody");
    body.addEventListener("click", (e) => {
      const t = e.target;
      const q = t.closest(".qty");
      if (q && t.closest("[data-inc]")) return setQty(q.dataset.id, (cart[q.dataset.id] || 0) + 1);
      if (q && t.closest("[data-dec]")) return setQty(q.dataset.id, (cart[q.dataset.id] || 0) - 1);
      if (t.closest("[data-rm]")) return setQty(t.closest("[data-rm]").dataset.rm, 0);
      if (t.closest("#toCheckout")) { view = "checkout"; return renderDrawer(); }
      if (t.closest("#backCart")) { rememberForm(); view = "cart"; return renderDrawer(); }
      if (t.closest("#goShop")) closeDrawer();
      if (t.closest("#waOrder")) {
        updateWaHref();
        const err = formError();
        if (err) {
          e.preventDefault();
          $("#orderMsg").innerHTML = `<div class="msg err">${esc(err)}</div>`;
        } else {
          $("#orderMsg").innerHTML = `<div class="msg ok">WhatsApp s'ouvre : envoie le message pour valider ta commande.</div>`;
        }
      }
    });
    body.addEventListener("input", () => { updateWaHref(); const m = $("#orderMsg"); if (m) m.innerHTML = ""; });
    body.addEventListener("change", updateWaHref);
    body.addEventListener("submit", (e) => e.preventDefault());

    $("#starpick").addEventListener("click", (e) => {
      const b = e.target.closest("[data-n]");
      if (!b) return;
      rating = Number(b.dataset.n);
      renderStarPick();
    });
    $("#reviewForm").addEventListener("submit", submitReview);
  }

  init();
})();
