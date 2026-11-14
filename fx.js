/* SATURA BEAUTY — animations (apparition au défilement, étincelles, parallaxe) et mode clair / sombre */
(() => {
  "use strict";
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- mode clair / sombre ---------- */
  const btn = document.getElementById("themeBtn");
  const current = () => root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const label = () => btn && btn.setAttribute("aria-label", current() === "dark" ? "Passer en mode clair" : "Passer en mode sombre");
  label();
  if (btn) btn.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    root.classList.add("theme-anim");
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("satura-theme", next); } catch { /* ignore */ }
    label();
    setTimeout(() => root.classList.remove("theme-anim"), 500);
  });

  if (reduce) return; // pas d'animation si la personne les a désactivées

  /* ---------- apparition au défilement ---------- */
  if ("IntersectionObserver" in window) {
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        io.unobserve(el);
        el.classList.add("in");
        // une fois apparu, l'élément redevient normal (le survol reprend sa vitesse)
        setTimeout(() => { el.classList.remove("rv", "in"); el.style.removeProperty("--d"); }, 1400);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });

    window.fxReveal = (nodes) => {
      [...nodes].forEach((el, i) => {
        el.classList.add("rv");
        el.style.setProperty("--d", (i % 5) * 80 + "ms");
        io.observe(el);
      });
    };
    window.fxReveal(document.querySelectorAll(
      "section .eyebrow, section .title, section .sub, .trust > div, .step, .duo > *, .filters, .zones, .rev-head, #reviewForm"
    ));
    // filet de sécurité : tout finit visible même si l'observateur n'a rien déclenché
    setTimeout(() => document.querySelectorAll(".rv").forEach((el) => el.classList.add("in")), 8000);
  }

  /* ---------- étincelles dorées dans l'accueil ---------- */
  const hero = document.querySelector(".hero");
  if (hero) {
    for (let i = 0; i < 18; i++) {
      const s = document.createElement("span");
      s.className = "spark";
      const size = 3 + Math.random() * 5;
      s.style.cssText = `left:${Math.random() * 100}%;bottom:${Math.random() * 40}%;width:${size}px;height:${size}px;animation-duration:${9 + Math.random() * 9}s;animation-delay:${-Math.random() * 14}s`;
      hero.appendChild(s);
    }
  }

  /* ---------- en-tête + parallaxe de la bannière dorée ---------- */
  const nav = document.querySelector("header.nav");
  const bannerImg = document.querySelector(".gold-banner > img");
  const banner = document.querySelector(".gold-banner");
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 8);
    if (banner && bannerImg) {
      const r = banner.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; // -1 … 1
        bannerImg.style.transform = `translateY(${(p * -34).toFixed(1)}px)`;
      }
    }
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
})();
