/* SATURA BEAUTY — vitrine : 3 façons de parcourir la gamme (sans bibliothèque, sans physique)
   1. Roue    : l'angle de chaque produit devient sin/cos, puis UNE seule matrix() CSS par produit, recalculée à chaque frame du glisser.
   2. Rail    : un chemin SVG courbe ; au survol un produit grossit, les autres s'assombrissent.
   3. Mélange : un bouton remélange le tableau des produits et la grille se redessine. */
(() => {
  "use strict";
  const S = window.SATURA;
  const root = document.getElementById("vitrine");
  if (!S || !root) return;

  const P = S.products;
  const n = P.length;
  const $ = (s) => root.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " F CFA";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const add = (id) => window.SaturaShop && window.SaturaShop.add(id);

  /* ---------- fiche du produit mis en avant (roue et rail) ---------- */
  const info = $("#vInfo");
  let activeId = null;
  function setActive(p) {
    if (!p || p.id === activeId) return;
    activeId = p.id;
    info.innerHTML = `
      <div class="vi-txt"><h4>${esc(p.name)}</h4><p>${esc(p.desc)}</p><b>${money(p.price)}</b></div>
      <button class="btn" type="button" data-add="${esc(p.id)}">Ajouter au panier</button>`;
  }
  info.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (!b) return;
    add(b.dataset.add);
    b.textContent = "Ajouté ✔";
    setTimeout(() => { b.textContent = "Ajouter au panier"; }, 1200);
  });

  /* ======================================================
     1. ROUE — glisser pour la faire tourner
     ====================================================== */
  const wheel = (() => {
    const el = $("#wheel");
    const step = (2 * Math.PI) / n;
    let angle = 0; // rotation de la roue, en radians
    let R = 200, tilt = 20;
    let anim = 0, raf = 0;

    const items = P.map((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "w-item";
      b.dataset.i = i;
      b.setAttribute("aria-label", p.name);
      b.innerHTML = `<span class="w-face"><img src="${esc(p.image)}" alt="" draggable="false" width="896" height="1195"><i class="glare"></i></span>`;
      el.appendChild(b);
      return b;
    });

    const frontIndex = () => ((Math.round(-angle / step) % n) + n) % n;

    function layout() {
      raf = 0;
      items.forEach((b, i) => {
        const th = angle + i * step;
        const s = Math.sin(th), c = Math.cos(th);
        const depth = (c + 1) / 2;               // 0 = au fond, 1 = devant
        const sc = 0.52 + 0.48 * depth;           // plus petit au fond
        const tx = R * s;                         // position sur l'orbite (sin)
        const ty = tilt * c;                      // profondeur de l'ellipse (cos)
        b.style.transform = `matrix(${sc.toFixed(4)},0,0,${sc.toFixed(4)},${tx.toFixed(2)},${ty.toFixed(2)})`;
        b.style.zIndex = String(Math.round(depth * 100));
        b.style.opacity = (0.38 + 0.62 * depth).toFixed(3);
        b.classList.toggle("front", i === frontIndex());
      });
      setActive(P[frontIndex()]);
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(layout); };

    function measure() {
      const w = el.clientWidth || 320;
      const iw = Math.max(110, Math.min(190, w * 0.3));
      R = Math.max(70, Math.min(360, (w - iw) / 2 * 0.9));
      tilt = iw * 0.13;
      el.style.setProperty("--iw", iw + "px");
      el.style.setProperty("--R", R + "px");
      layout();
    }

    function animateTo(target) {
      cancelAnimationFrame(anim);
      const from = angle, t0 = performance.now(), dur = reduce ? 0 : 380;
      const frame = (now) => {
        const p = dur ? Math.min(1, (now - t0) / dur) : 1;
        angle = from + (target - from) * (1 - Math.pow(1 - p, 3));
        layout();
        if (p < 1) anim = requestAnimationFrame(frame);
      };
      anim = requestAnimationFrame(frame);
    }
    const snapNearest = () => animateTo(Math.round(angle / step) * step);
    const toIndex = (i) => {
      const k = Math.round((angle + i * step) / (2 * Math.PI)); // chemin le plus court
      animateTo(-i * step + k * 2 * Math.PI);
    };
    const move = (dir) => animateTo((Math.round(angle / step) - dir) * step);

    /* « dans la main » : le produit de devant s'incline vers le doigt / la souris,
       avec un reflet qui suit et une ombre au sol qui se décale */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function setTilt(cx, cy) {
      const r = items[frontIndex()].getBoundingClientRect();
      const nx = clamp((cx - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
      const ny = clamp((cy - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
      el.classList.add("tilting");
      el.style.setProperty("--ry", (nx * 16).toFixed(1) + "deg");
      el.style.setProperty("--rx", (-ny * 16).toFixed(1) + "deg");
      el.style.setProperty("--gx", (50 + nx * 38).toFixed(0) + "%");
      el.style.setProperty("--gy", (45 + ny * 38).toFixed(0) + "%");
    }
    function resetTilt() {
      el.classList.remove("tilting");
      ["--rx", "--ry", "--lean", "--gx", "--gy"].forEach((k) => el.style.removeProperty(k));
    }
    el.addEventListener("pointerleave", (e) => { if (!dragging && e.pointerType === "mouse") resetTilt(); });

    // option : incliner le téléphone (gyroscope)
    const gyroBtn = $("#gyroBtn");
    let gyro = false;
    function onOrient(e) {
      if (e.gamma == null || el.classList.contains("tilting")) return;
      const ry = clamp(e.gamma, -28, 28) * 0.55;
      const rx = -clamp((e.beta || 45) - 45, -28, 28) * 0.5;
      el.style.setProperty("--ry", ry.toFixed(1) + "deg");
      el.style.setProperty("--rx", rx.toFixed(1) + "deg");
      el.style.setProperty("--gx", (50 + ry * 2).toFixed(0) + "%");
      el.style.setProperty("--gy", (45 - rx * 2).toFixed(0) + "%");
    }
    function startGyro() { if (gyro) return; gyro = true; addEventListener("deviceorientation", onOrient); if (gyroBtn) gyroBtn.hidden = true; }
    try {
      if (window.DeviceOrientationEvent) {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {      // iPhone : il faut demander l'accord
          if (gyroBtn) {
            gyroBtn.hidden = false;
            gyroBtn.addEventListener("click", () => {
              DeviceOrientationEvent.requestPermission().then((r) => { if (r === "granted") startGyro(); }).catch(() => {});
            });
          }
        } else if (matchMedia("(pointer: coarse)").matches) startGyro();            // Android
      }
    } catch { /* capteur indisponible : le toucher et la souris suffisent */ }

    // glisser-déposer
    let dragging = false, sx = 0, sa = 0, moved = 0, downItem = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".w-nav")) return;
      dragging = true; moved = 0; sx = e.clientX; sa = angle;
      downItem = e.target.closest(".w-item");
      setTilt(e.clientX, e.clientY);
      cancelAnimationFrame(anim);
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      moved = Math.max(moved, Math.abs(dx));
      angle = sa + dx / R;      // 1 px glissé = 1/R radian
      el.style.setProperty("--lean", clamp(dx / 7, -22, 22).toFixed(1) + "deg"); // le produit penche dans le sens du geste
      setTilt(e.clientX, e.clientY);
      schedule();               // recalcul des matrix() à la frame suivante
    });
    el.addEventListener("pointermove", (e) => { if (!dragging && e.pointerType === "mouse") setTilt(e.clientX, e.clientY); });
    const end = (event) => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("dragging");
      el.style.removeProperty("--lean");
      if (event && event.pointerType !== "mouse") resetTilt();
      if (moved < 6 && downItem) toIndex(Number(downItem.dataset.i)); // simple clic
      else snapNearest();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    });
    $("#wPrev").addEventListener("click", () => move(-1));
    $("#wNext").addEventListener("click", () => move(1));
    addEventListener("resize", measure);

    return { measure };
  })();

  /* ======================================================
     2. RAIL — chemin SVG courbe, un produit mis en avant à la fois
     ====================================================== */
  const rail = (() => {
    const svg = $("#railSvg");
    const NS = "http://www.w3.org/2000/svg";
    const W = 1000, H = 470, iw = 112, ih = 150;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const mk = (tag, attrs = {}) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    };

    const path = mk("path", { d: "M 70 110 C 330 420 670 420 930 110", class: "r-path" });
    svg.appendChild(path);
    const L = path.getTotalLength();

    const nodes = P.map((p, i) => {
      const len = (L * (i + 0.5)) / n;
      const pt = path.getPointAtLength(len);
      const a = path.getPointAtLength(Math.max(0, len - 1));
      const b = path.getPointAtLength(Math.min(L, len + 1));
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

      const g = mk("g", { class: "r-item", transform: `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${(deg * 0.45).toFixed(1)})`, tabindex: "0", role: "button", "aria-label": p.name });
      const inner = mk("g", { class: "r-inner" });
      const clip = mk("clipPath", { id: "rc" + i });
      clip.appendChild(mk("rect", { x: -iw / 2, y: -ih / 2, width: iw, height: ih, rx: 14 }));
      const img = mk("image", { x: -iw / 2, y: -ih / 2, width: iw, height: ih, preserveAspectRatio: "xMidYMid slice", "clip-path": `url(#rc${i})` });
      img.setAttribute("href", p.image);
      const shade = mk("rect", { x: -iw / 2, y: -ih / 2, width: iw, height: ih, rx: 14, class: "shade" });
      const frame = mk("rect", { x: -iw / 2, y: -ih / 2, width: iw, height: ih, rx: 14, class: "frame" });
      inner.append(clip, img, shade, frame);
      g.appendChild(inner);
      svg.appendChild(g);
      return g;
    });

    let current = -1;
    function activate(i) {
      if (i === current) return;
      current = i;
      svg.classList.add("has-active");
      nodes.forEach((g, k) => g.classList.toggle("active", k === i));
      setActive(P[i]);
    }
    function clear() {
      current = -1;
      svg.classList.remove("has-active");
      nodes.forEach((g) => g.classList.remove("active"));
    }
    nodes.forEach((g, i) => {
      g.addEventListener("pointerenter", () => activate(i));
      g.addEventListener("pointerdown", () => activate(i)); // toucher sur téléphone
      g.addEventListener("focus", () => activate(i));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(i); }
      });
    });
    svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") clear(); });
    return { activate };
  })();

  /* ======================================================
     3. MÉLANGE — un bouton remélange le tableau
     ====================================================== */
  const shuffle = (() => {
    const grid = $("#shuffleGrid");
    const live = $("#shuffleLive");
    let order = [...P];

    const mix = (a) => {                         // Fisher-Yates : la seule « mécanique »
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    function render() {
      grid.innerHTML = order.map((p) => `
        <article class="s-card">
          <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" width="896" height="1195">
          <h4>${esc(p.name)}</h4>
          <b>${money(p.price)}</b>
          <button class="btn" type="button" data-add="${esc(p.id)}">Ajouter</button>
        </article>`).join("");
    }
    $("#shuffleBtn").addEventListener("click", () => {
      const before = order.map((p) => p.id).join();
      let tries = 0;
      do { mix(order); } while (order.map((p) => p.id).join() === before && ++tries < 10);
      render();
      live.textContent = "Gamme mélangée : " + order.map((p) => p.name).join(", ");
    });
    $("#resetBtn").addEventListener("click", () => {
      order = [...P];
      render();
      live.textContent = "Ordre d'origine rétabli";
    });
    grid.addEventListener("click", (e) => {
      const b = e.target.closest("[data-add]");
      if (!b) return;
      add(b.dataset.add);
      b.textContent = "Ajouté ✔";
      setTimeout(() => { b.textContent = "Ajouter"; }, 1200);
    });
    render();
  })();

  /* ---------- onglets ---------- */
  const tabs = [...root.querySelectorAll("[data-mode]")];
  const panels = [...root.querySelectorAll("[data-panel]")];
  function show(mode) {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mode === mode)));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== mode; });
    info.hidden = mode === "shuffle";
    if (mode === "wheel") requestAnimationFrame(wheel.measure);
    if (mode === "rail") requestAnimationFrame(() => { // sur téléphone : on centre le rail
      const sc = $(".rail-scroll");
      sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
    });
  }
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.mode)));
  show("wheel");
})();
