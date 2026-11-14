<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Gestion des avis — SATURA BEAUTY</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="wrap" style="padding-top:24px;padding-bottom:40px">
  <h1 style="font-size:30px;margin-bottom:12px">Avis à valider</h1>

  <form class="form" id="login" novalidate>
    <label>Mot de passe administrateur<input type="password" id="pw" autocomplete="current-password"></label>
    <div id="loginMsg"></div>
    <button class="btn" type="submit">Entrer</button>
  </form>

  <div id="panel" hidden>
    <div class="tabs"><button class="chip" id="logout" aria-pressed="false">Quitter</button></div>
    <div id="msg"></div>
    <div id="content"></div>
  </div>
</div>
<script>
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let pw = "";
  try { pw = sessionStorage.getItem("satura-admin") || ""; } catch {}

  async function api(body) {
    const r = await fetch("/api/admin", {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-admin-password": pw },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || "Erreur"), { status: r.status });
    return d;
  }
  function lock(msg) {
    pw = "";
    try { sessionStorage.removeItem("satura-admin"); } catch {}
    $("#panel").hidden = true;
    $("#login").hidden = false;
    if (msg) $("#loginMsg").innerHTML = `<div class="msg err">${esc(msg)}</div>`;
  }
  async function load() {
    try {
      const { pending } = await api();
      $("#content").innerHTML = pending.length
        ? pending.map((r) => `
          <div class="rev" style="margin-bottom:12px">
            <div class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
            <q>${esc(r.text)}</q>
            <small>${esc(r.name)}${r.city ? " · " + esc(r.city) : ""}</small>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn" data-rid="${esc(r.id)}" data-act="approve-review">Publier</button>
              <button class="btn ghost" data-rid="${esc(r.id)}" data-act="delete-review">Supprimer</button>
            </div>
          </div>`).join("")
        : `<p class="sub">Aucun avis en attente.</p>`;
      $("#login").hidden = true;
      $("#panel").hidden = false;
      try { sessionStorage.setItem("satura-admin", pw); } catch {}
    } catch (e) {
      if (e.status === 401) lock(pw ? "Mot de passe incorrect." : "");
      else $("#msg").innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
    }
  }
  $("#login").addEventListener("submit", (e) => { e.preventDefault(); pw = $("#pw").value; load(); });
  $("#logout").addEventListener("click", () => lock(""));
  $("#content").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-rid]");
    if (!b) return;
    try { await api({ action: b.dataset.act, id: b.dataset.rid }); load(); }
    catch (err) { $("#msg").innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
  });
  if (pw) load();
})();
</script>
</body>
</html>
