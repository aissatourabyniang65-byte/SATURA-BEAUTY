/* SATURA BEAUTY — Studio 3D
   WebGL natif, aucune bibliothèque. Les produits sont des objets 3D construits par révolution (lathe),
   éclairés avec un faux environnement (reflets de studio), posés sur des piédestaux.
   La caméra est pilotée par le défilement ; on fait tourner le produit en le glissant. */
(() => {
  "use strict";
  const S = window.SATURA;
  const sec = document.getElementById("studio");
  if (!S || !sec) return;
  const canvas = document.getElementById("studioCanvas");
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) { sec.hidden = true; return; }

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const P = S.products;
  const n = P.length;
  const SP = 3.7; // écart entre deux produits
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " F CFA";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- maths 4×4 (colonnes) ---------- */
  const M = {
    id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    T(x, y, z) { const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    S(k) { const m = M.id(); m[0] = m[5] = m[10] = k; return m; },
    RY(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    RZ(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
    persp(f, asp, nr, fr) {
      const t = 1 / Math.tan(f / 2), m = new Float32Array(16);
      m[0] = t / asp; m[5] = t; m[10] = (fr + nr) / (nr - fr); m[11] = -1; m[14] = (2 * fr * nr) / (nr - fr);
      return m;
    },
    look(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([
        xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
      ]);
    },
  };

  /* ---------- shaders ---------- */
  const PREC = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  function program(vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, PREC + fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  let objProg, bgProg, dustProg;
  try {
    objProg = program(`
      attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUV;
      uniform mat4 uVP; uniform mat4 uM; uniform mat3 uNM;
      varying vec3 vN; varying vec3 vW; varying vec2 vUV;
      void main(){ vec4 w = uM * vec4(aPos,1.0); vW = w.xyz; vN = normalize(uNM * aNor); vUV = aUV; gl_Position = uVP * w; }`,
    `
      varying vec3 vN; varying vec3 vW; varying vec2 vUV;
      uniform vec3 uCam; uniform vec3 uColor; uniform float uMetal; uniform float uRough; uniform float uAlpha;
      uniform float uUseTex; uniform sampler2D uTex; uniform float uMode; uniform float uSparkle; uniform float uTime;
      uniform vec3 uFogCol; uniform float uFogDen;
      vec3 env(vec3 r){
        float h = r.y * 0.5 + 0.5;
        vec3 c = mix(vec3(0.10,0.04,0.06), vec3(0.78,0.66,0.62), smoothstep(0.2,0.95,h));
        c += vec3(1.0,0.96,0.92) * smoothstep(0.90,0.985, dot(r, normalize(vec3(-0.5,0.7,0.6)))) * 1.5;
        c += vec3(1.0,0.82,0.70) * smoothstep(0.88,0.97, dot(r, normalize(vec3(0.85,0.35,0.35)))) * 1.0;
        c += vec3(0.9,0.6,0.7) * smoothstep(0.90,0.98, dot(r, normalize(vec3(0.0,0.3,-1.0)))) * 0.6;
        return c;
      }
      void main(){
        if (uMode > 0.5) { float a = smoothstep(0.5, 0.0, length(vUV - 0.5)) * 0.62; gl_FragColor = vec4(0.0,0.0,0.0,a*uAlpha); return; }
        vec3 V = normalize(uCam - vW);
        vec3 N = normalize(vN);
        if (dot(N,V) < 0.0) N = -N;
        vec3 base = uColor;
        if (uUseTex > 0.5) { vec4 t = texture2D(uTex, vUV); base = mix(base, t.rgb, t.a); }
        vec3 L1 = normalize(vec3(-0.5,0.8,0.7)); vec3 L2 = normalize(vec3(0.85,0.25,0.4));
        float d1 = max(dot(N,L1),0.0); float d2 = max(dot(N,L2),0.0) * 0.5;
        vec3 amb = mix(vec3(0.20,0.10,0.11), vec3(0.50,0.41,0.40), N.y*0.5+0.5);
        vec3 diff = base * (amb + vec3(1.0,0.96,0.92)*d1 + vec3(1.0,0.78,0.68)*d2);
        vec3 R = reflect(-V, N);
        float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);
        vec3 H = normalize(L1 + V);
        float spec = pow(max(dot(N,H),0.0), mix(220.0, 18.0, uRough));
        vec3 e = env(R);
        vec3 dielectric = diff + e * fres * (0.55 - uRough*0.4) + vec3(spec) * (1.0 - uRough) * 0.9;
        vec3 metal = base * e * 1.2 + vec3(spec) * 0.7;
        vec3 col = mix(dielectric, metal, uMetal);
        if (uSparkle > 0.0) {
          vec3 cell = floor(vW * 70.0);
          float hsh = fract(sin(dot(cell, vec3(12.9898,78.233,37.719))) * 43758.5453);
          float tw = 0.5 + 0.5 * sin(uTime * 3.0 + hsh * 40.0 + dot(V, N) * 12.0);
          col += step(0.965, hsh) * tw * uSparkle * vec3(1.0,0.92,0.82);
        }
        float dist = length(uCam - vW);
        float f = 1.0 - exp(-uFogDen * uFogDen * dist * dist);
        col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
        float a = uAlpha;
        if (a < 0.99) a = clamp(a + fres * 0.85 + spec * 0.6, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }`);
    bgProg = program(`
      attribute vec2 aP; varying vec2 vUV;
      void main(){ vUV = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.999, 1.0); }`,
    `
      varying vec2 vUV; uniform float uAsp; uniform vec2 uPar;
      void main(){
        vec2 p = vUV + uPar * 0.015;
        vec2 q = (p - vec2(0.5, 0.60)) * vec2(uAsp > 1.0 ? 1.0 : 1.0/uAsp*0.9, 1.0);
        float d = length(q * vec2(1.0, 1.15));
        vec3 col = mix(vec3(0.34,0.09,0.15), vec3(0.055,0.018,0.035), smoothstep(0.0, 0.85, d));
        col += vec3(0.30,0.17,0.07) * smoothstep(0.30, 0.0, abs(p.y - 0.30)) * 0.22;
        col *= 1.0 - 0.35 * smoothstep(0.55, 1.0, length(vUV - 0.5) * 1.5);
        gl_FragColor = vec4(col, 1.0);
      }`);
    dustProg = program(`
      attribute vec4 aSeed; uniform mat4 uVP; uniform float uTime; uniform float uDpr; varying float vA;
      void main(){
        vec3 p = aSeed.xyz;
        float ph = fract(aSeed.w * 7.31);
        p.y = mod(p.y + uTime * (0.05 + ph * 0.07), 5.5);
        p.x += sin(uTime * 0.35 + aSeed.w * 6.28) * 0.28;
        p.z += cos(uTime * 0.28 + aSeed.w * 9.0) * 0.2;
        gl_Position = uVP * vec4(p, 1.0);
        gl_PointSize = (1.6 + ph * 4.2) * uDpr * (7.0 / max(gl_Position.w, 1.0));
        vA = 0.45 + 0.55 * sin(uTime * 1.3 + aSeed.w * 30.0);
      }`,
    `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA * 0.75;
        gl_FragColor = vec4(vec3(1.0,0.80,0.48) * a, a);
      }`);
  } catch (err) {
    console.warn("Studio 3D indisponible :", err);
    sec.hidden = true;
    return;
  }

  /* ---------- géométrie ---------- */
  function mesh(pos, nor, uv, idx) {
    const inter = new Float32Array((pos.length / 3) * 8);
    for (let i = 0; i < pos.length / 3; i++) {
      inter.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], uv[i * 2], uv[i * 2 + 1]], i * 8);
    }
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { vb, ib, count: idx.length };
  }

  // surface de révolution : profile = [[rayon, hauteur], …] de bas en haut.
  // Un point répété donne une arête vive.
  function lathe(profile, seg = 64) {
    const pos = [], nor = [], uv = [], idx = [];
    const m = profile.length;
    const sn = [];
    for (let k = 0; k < m - 1; k++) {
      const dr = profile[k + 1][0] - profile[k][0], dy = profile[k + 1][1] - profile[k][1], len = Math.hypot(dr, dy);
      sn.push(len < 1e-6 ? null : [dy / len, -dr / len]);
    }
    let ymin = Infinity, ymax = -Infinity;
    profile.forEach((p) => { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); });
    for (let i = 0; i < m; i++) {
      const a = sn[i - 1] || null, b = sn[i] || null;
      let nn = a && b ? [a[0] + b[0], a[1] + b[1]] : (a || b || [1, 0]);
      const l = Math.hypot(nn[0], nn[1]) || 1; nn = [nn[0] / l, nn[1] / l];
      for (let j = 0; j <= seg; j++) {
        const phi = (j / seg) * Math.PI * 2, c = Math.cos(phi), s = Math.sin(phi);
        pos.push(profile[i][0] * c, profile[i][1], profile[i][0] * s);
        nor.push(nn[0] * c, nn[1], nn[0] * s);
        uv.push(1 - j / seg, 1 - (profile[i][1] - ymin) / (ymax - ymin || 1));
      }
    }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    return mesh(pos, nor, uv, idx);
  }

  // disque horizontal (étiquette sur un couvercle) : uv planes
  function disc(r, y, seg = 64) {
    const pos = [0, y, 0], nor = [0, 1, 0], uv = [0.5, 0.5], idx = [];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(r * c, y, r * s); nor.push(0, 1, 0); uv.push(0.5 + 0.5 * c, 0.5 + 0.5 * s);
    }
    for (let j = 1; j <= seg; j++) idx.push(0, j + 1, j);
    return mesh(pos, nor, uv, idx);
  }

  /* ---------- textures d'étiquettes (dessinées en 2D puis envoyées au GPU) ---------- */
  const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const SANS = "'Poppins', system-ui, sans-serif";
  const pot = (v) => [64, 128, 256, 512, 1024, 2048].reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b));
  function spaced(ctx, text, x, y, gap) {
    const widths = [...text].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
    let cx = x - total / 2;
    [...text].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + gap; });
  }
  function fitText(ctx, text, maxW, size, weight, family) {
    let s = size;
    do { ctx.font = `${weight} ${s}px ${family}`; s -= 1; } while (ctx.measureText(text).width > maxW && s > 8);
  }
  function upload(cv) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension("EXT_texture_filter_anisotropic");
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }
  // étiquette qui fait le tour du produit : la face avant est au centre à 75 % de la largeur
  function bandLabel(r, bandH, name, paper) {
    const W = 2048, circ = Math.PI * 2 * r, sx = W / circ;
    const Hb = bandH * sx, H = pot(Hb), k = H / Hb;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.setTransform(1, 0, 0, k, 0, 0);
    ctx.fillStyle = paper; ctx.fillRect(0, 0, W, Hb);
    const cx = W * 0.75;
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.strokeStyle = "#b88a45"; ctx.lineWidth = Hb * 0.012;
    ctx.beginPath(); ctx.moveTo(0, Hb * 0.04); ctx.lineTo(W, Hb * 0.04); ctx.moveTo(0, Hb * 0.96); ctx.lineTo(W, Hb * 0.96); ctx.stroke();
    ctx.fillStyle = "#3b2a28";
    ctx.font = `600 ${Hb * 0.27}px ${SERIF}`; spaced(ctx, "SATURA", cx, Hb * 0.25, Hb * 0.02);
    ctx.fillStyle = "#a07a3a"; ctx.font = `500 ${Hb * 0.085}px ${SANS}`; spaced(ctx, "BEAUTY", cx, Hb * 0.45, Hb * 0.06);
    ctx.fillRect(cx - Hb * 0.62, Hb * 0.45 - 1, Hb * 0.22, Hb * 0.012); ctx.fillRect(cx + Hb * 0.4, Hb * 0.45 - 1, Hb * 0.22, Hb * 0.012);
    ctx.fillStyle = "#3b2a28"; fitText(ctx, name, Hb * 1.15, Hb * 0.15, 500, SERIF);
    ctx.fillText(name, cx, Hb * 0.67);
    ctx.fillStyle = "#6b5855"; ctx.font = `500 ${Hb * 0.085}px ${SANS}`; ctx.fillText("+221 78 650 17 69", cx, Hb * 0.86);
    // au dos : le logo se répète
    ctx.fillStyle = "#3b2a28"; ctx.font = `600 ${Hb * 0.2}px ${SERIF}`; spaced(ctx, "SATURA", W * 0.25, Hb * 0.42, Hb * 0.02);
    ctx.fillStyle = "#a07a3a"; ctx.font = `500 ${Hb * 0.08}px ${SANS}`; spaced(ctx, "BEAUTY", W * 0.25, Hb * 0.62, Hb * 0.06);
    return upload(cv);
  }
  // étiquette ronde sur le dessus d'un couvercle
  function lidLabel(R, name, paper, lines) {
    const W = 512, c = W / 2;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = W;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.arc(c, c, c - 6, 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = "#b88a45"; ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, c - 26, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#3b2a28"; ctx.font = `600 78px ${SERIF}`; spaced(ctx, "SATURA", c, c - 128, 3);
    ctx.fillStyle = "#a07a3a"; ctx.font = `500 26px ${SANS}`; spaced(ctx, "BEAUTY", c, c - 76, 12);
    ctx.fillStyle = "#3b2a28";
    lines.forEach((ln, i) => { ctx.font = `italic 600 58px ${SERIF}`; fitText(ctx, ln, 330, 58, "italic 600", SERIF); ctx.fillText(ln, c, c + 20 + i * 62); });
    ctx.fillStyle = "#6b5855"; ctx.font = `500 22px ${SANS}`; ctx.fillText(name.length ? "Skincare products & more" : "", c, c + 20 + lines.length * 62 + 34);
    return upload(cv);
  }

  /* ---------- matériaux ---------- */
  const mat = (o) => Object.assign({ color: [1, 1, 1], metal: 0, rough: 0.4, alpha: 1, tex: null, sparkle: 0 }, o);
  const GOLD = [0.83, 0.65, 0.33];

  /* ---------- les produits ---------- */
  function addPedestal(parts) {
    parts.push({ m: lathe([[0, -0.2], [1.55, -0.2], [1.6, -0.15], [1.6, -0.03], [1.5, 0], [0, 0]]), mat: mat({ color: [0.10, 0.05, 0.065], rough: 0.18, metal: 0.25 }) });
    parts.push({ m: lathe([[1.61, -0.13], [1.61, -0.06]]), mat: mat({ color: GOLD, metal: 1, rough: 0.25 }) });
    parts.push({ m: disc(1.25, 0.004), mat: mat({ alpha: 1, mode: 1 }), shadow: true });
  }

  function jar(o) {
    const r = o.r, h = o.h, lidH = o.lidH || 0.42, hTop = h * 0.93;
    const parts = [];
    addPedestal(parts);
    parts.push({ m: lathe([[0, 0.03], [r - 0.12, 0.03], [r - 0.03, 0.07], [r, 0.17], [r, hTop], [r, hTop], [0, hTop]]), mat: mat({ color: o.content, rough: 0.35, sparkle: o.sparkle || 0 }) });
    parts.push({ m: lathe([[r + 0.026, h * 0.2], [r + 0.026, h * 0.8]]), mat: mat({ tex: bandLabel(r + 0.026, h * 0.6, o.name, o.paper), rough: 0.55 }) });
    parts.push({ m: lathe([[r + 0.034, h - 0.02], [r + 0.034, h + 0.09]]), mat: mat({ color: GOLD, metal: 1, rough: 0.22 }) });
    parts.push({ m: lathe([[0, 0], [r - 0.12, 0], [r - 0.03, 0.04], [r + 0.012, 0.15], [r + 0.012, h]]), mat: mat({ color: [1, 0.97, 0.96], rough: 0.05, alpha: o.shellAlpha || 0.14 }), clear: true });
    parts.push({ m: lathe([[r + 0.03, h], [r + 0.03, h + lidH - 0.08], [r - 0.04, h + lidH], [r - 0.04, h + lidH], [0, h + lidH]]), mat: mat({ color: o.lid, rough: 0.06, alpha: o.lidAlpha || 0.3 }), clear: true });
    return { parts, height: h + lidH };
  }

  function pump(o) {
    const parts = [];
    addPedestal(parts);
    const body = [[0, 0.02], [0.5, 0.02], [0.6, 0.09], [0.63, 0.22], [0.63, 1.5], [0.58, 1.75], [0.36, 1.97], [0.3, 2.06], [0.3, 2.14], [0, 2.14]];
    parts.push({ m: lathe(body), mat: mat({ color: o.color, rough: 0.12 }) });
    parts.push({ m: lathe([[0.645, 0.5], [0.645, 1.38]]), mat: mat({ tex: bandLabel(0.645, 0.88, o.name, "#fdfbf8"), rough: 0.5 }) });
    parts.push({ m: lathe([[0.42, 2.1], [0.42, 2.14], [0.42, 2.14], [0.4, 2.46], [0.4, 2.46], [0.34, 2.5], [0.34, 2.5], [0, 2.5]]), mat: mat({ color: GOLD, metal: 1, rough: 0.2 }) });
    parts.push({ m: lathe([[0.11, 2.5], [0.11, 3.0]]), mat: mat({ color: GOLD, metal: 1, rough: 0.2 }) });
    parts.push({ m: lathe([[0.25, 3.0], [0.25, 3.0], [0.25, 3.12], [0.22, 3.18], [0.22, 3.18], [0, 3.18]]), mat: mat({ color: GOLD, metal: 1, rough: 0.2 }) });
    // bec de la pompe : cylindre couché, tourné vers la droite
    parts.push({ m: lathe([[0.1, 0], [0.1, 0.95], [0.1, 0.95], [0, 0.95]]), mat: mat({ color: GOLD, metal: 1, rough: 0.2 }), local: M.mul(M.T(0.1, 3.06, 0), M.RZ(-Math.PI / 2)) });
    return { parts, height: 3.2 };
  }

  function tub(o) {
    const r = 1.12, h = 0.62, lidH = 0.34;
    const parts = [];
    addPedestal(parts);
    parts.push({ m: lathe([[0, 0.02], [r - 0.1, 0.02], [r, 0.1], [r, h], [r, h], [0, h]]), mat: mat({ color: [0.97, 0.95, 0.94], rough: 0.2 }) });
    parts.push({ m: lathe([[r + 0.02, h - 0.01], [r + 0.02, h + lidH - 0.12], [r - 0.06, h + lidH], [r - 0.06, h + lidH], [0, h + lidH]]), mat: mat({ color: [0.88, 0.45, 0.62], rough: 0.14 }) });
    parts.push({ m: lathe([[r + 0.03, h - 0.02], [r + 0.03, h + 0.03]]), mat: mat({ color: GOLD, metal: 1, rough: 0.25 }) });
    parts.push({ m: disc(r - 0.12, h + lidH + 0.004), mat: mat({ color: [0.88, 0.45, 0.62], tex: lidLabel(r - 0.12, "x", "#fbf6f1", o.lines), rough: 0.45 }) });
    return { parts, height: h + lidH };
  }

  function creamJar(o) {
    const r = 0.78, h = 0.8, lidH = 0.42;
    const parts = [];
    addPedestal(parts);
    parts.push({ m: lathe([[0, 0.04], [r - 0.14, 0.04], [r - 0.04, 0.1], [r - 0.02, 0.2], [r - 0.02, h - 0.1], [r - 0.12, h - 0.1], [r * 0.55, h - 0.04], [r * 0.2, h + 0.04], [0, h + 0.1]]), mat: mat({ color: [0.99, 0.97, 0.95], rough: 0.5 }) });
    parts.push({ m: lathe([[0, 0], [r - 0.12, 0], [r - 0.02, 0.07], [r + 0.02, 0.2], [r + 0.02, h]]), mat: mat({ color: [0.95, 0.98, 1], rough: 0.04, alpha: 0.2 }), clear: true });
    parts.push({ m: lathe([[r + 0.04, h - 0.02], [r + 0.04, h + lidH - 0.07], [r - 0.03, h + lidH], [r - 0.03, h + lidH], [0, h + lidH]]), mat: mat({ color: [0.98, 0.95, 0.9], rough: 0.2 }) });
    parts.push({ m: lathe([[r + 0.05, h - 0.02], [r + 0.05, h + 0.04]]), mat: mat({ color: GOLD, metal: 1, rough: 0.25 }) });
    parts.push({ m: disc(r - 0.1, h + lidH + 0.004), mat: mat({ color: [0.98, 0.95, 0.9], tex: lidLabel(r - 0.1, "x", "#f7f0e6", o.lines), rough: 0.45 }) });
    return { parts, height: h + lidH };
  }

  const BUILD = {
    "gommage-radiance-glow": (p) => jar({ r: 0.86, h: 1.15, content: [0.72, 0.40, 0.45], sparkle: 0.85, lid: [1, 0.93, 0.93], paper: "#fbf9f6", name: p.name }),
    "savon-corps-lena": (p) => jar({ r: 0.88, h: 1.05, content: [0.96, 0.62, 0.29], lid: [1, 0.97, 0.92], paper: "#f5eee2", name: "Savon de corps Léna" }),
    "savon-collagene-grasse": (p) => jar({ r: 0.9, h: 1.0, content: [0.96, 0.5, 0.52], lid: [0.98, 0.58, 0.7], lidAlpha: 0.55, paper: "#fbf7f3", name: p.name }),
    "lait-corps-glow-shine": (p) => pump({ color: [0.96, 0.84, 0.42], name: "Lait de corps" }),
    "savon-visage-correcteur": (p) => tub({ lines: ["Savon de", "Visage"] }),
    "creme-visage": (p) => creamJar({ lines: ["Crème de", "Visage"] }),
  };

  let products = [];
  function buildProducts() {
    products = P.map((p, i) => {
      const o = (BUILD[p.id] || BUILD["savon-corps-lena"])(p);
      return { p, parts: o.parts, height: o.height, yaw: 0 };
    });
  }

  /* ---------- fond et poussière dorée ---------- */
  const bgBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const DUST = 170;
  const dustBuf = gl.createBuffer();
  {
    const a = new Float32Array(DUST * 4);
    for (let i = 0; i < DUST; i++) a.set([(Math.random() - 0.5) * 16, Math.random() * 5.5, -3.5 + Math.random() * 7, Math.random()], i * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
  }

  /* ---------- rendu ---------- */
  let W = 1, H = 1, dpr = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.6 : 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  }

  const FOG = [0.075, 0.026, 0.046];
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let t = 0, tTarget = 0, active = -1, dragYaw = 0, dragVel = 0, dragging = false, lastTouch = 0;

  function bindObj() {
    gl.useProgram(objProg.p);
  }
  function drawPart(prog, part, model) {
    const m = part.mat;
    gl.uniform3fv(prog.u.uColor, m.color);
    gl.uniform1f(prog.u.uMetal, m.metal); gl.uniform1f(prog.u.uRough, m.rough);
    gl.uniform1f(prog.u.uAlpha, m.alpha); gl.uniform1f(prog.u.uSparkle, m.sparkle);
    gl.uniform1f(prog.u.uMode, m.mode || 0);
    if (m.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.tex); gl.uniform1i(prog.u.uTex, 0); gl.uniform1f(prog.u.uUseTex, 1); }
    else gl.uniform1f(prog.u.uUseTex, 0);
    const mm = part.local ? M.mul(model, part.local) : model;
    gl.uniformMatrix4fv(prog.u.uM, false, mm);
    gl.uniformMatrix3fv(prog.u.uNM, false, new Float32Array([mm[0], mm[1], mm[2], mm[4], mm[5], mm[6], mm[8], mm[9], mm[10]]));
    gl.bindBuffer(gl.ARRAY_BUFFER, part.m.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.m.ib);
    gl.drawElements(gl.TRIANGLES, part.m.count, gl.UNSIGNED_SHORT, 0);
  }

  function frame(time) {
    resize();
    const sec_t = time / 1000;
    const asp = W / H;
    gl.viewport(0, 0, W, H);

    // caméra
    par.x += (par.tx - par.x) * 0.06; par.y += (par.ty - par.y) * 0.06;
    const fov = 0.70;
    const zc = Math.max(8.0, 5.2 / asp);
    const cam = [par.x * 0.7, 2.2 + par.y * 0.35, zc];
    const view = M.look(cam, [0, 0.55, 0], [0, 1, 0]);
    const vp = M.mul(M.persp(fov, asp, 0.5, 60), view);

    // fond
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(bgProg.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    gl.uniform1f(bgProg.u.uAsp, asp); gl.uniform2f(bgProg.u.uPar, par.x, par.y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // objets
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    bindObj();
    gl.uniformMatrix4fv(objProg.u.uVP, false, vp);
    gl.uniform3fv(objProg.u.uCam, cam);
    gl.uniform3fv(objProg.u.uFogCol, FOG);
    gl.uniform1f(objProg.u.uFogDen, 0.052);
    gl.uniform1f(objProg.u.uTime, sec_t);

    const models = products.map((pr, i) => {
      const d = i - t;
      const focus = clamp(1 - Math.abs(d), 0, 1);
      const spin = reduce ? 0 : 0.32 * Math.sin(sec_t * 0.55 + i);
      const yaw = (i === active ? dragYaw : 0) + spin * (0.5 + focus * 0.5) - d * 0.38;
      const bob = reduce ? 0 : 0.035 * Math.sin(sec_t * 1.1 + i * 1.7);
      const k = 1 + 0.07 * focus;
      const model = M.mul(M.T(d * SP, bob, -Math.abs(d) * 0.85 - Math.abs(d) * Math.abs(d) * 0.12), M.mul(M.RY(yaw), M.S(k)));
      return { pr, model, dist: Math.hypot(d * SP - cam[0], -Math.abs(d) - zc) };
    });

    // 1) opaques
    gl.disable(gl.BLEND); gl.depthMask(true);
    models.forEach(({ pr, model }) => pr.parts.forEach((pt) => { if (!pt.clear && !pt.shadow) drawPart(objProg, pt, model); }));
    // 2) ombres + translucides, du plus loin au plus proche
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    models.slice().sort((a, b) => b.dist - a.dist).forEach(({ pr, model }) => {
      pr.parts.forEach((pt) => { if (pt.shadow) drawPart(objProg, pt, model); });
      pr.parts.forEach((pt) => { if (pt.clear) drawPart(objProg, pt, model); });
    });

    // poussière dorée (additive)
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(dustProg.p);
    gl.uniformMatrix4fv(dustProg.u.uVP, false, vp);
    gl.uniform1f(dustProg.u.uTime, reduce ? 0 : sec_t); gl.uniform1f(dustProg.u.uDpr, dpr);
    gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    gl.drawArrays(gl.POINTS, 0, DUST);
    gl.depthMask(true);
  }

  /* ---------- défilement → produit mis en avant ---------- */
  const info = document.getElementById("stInfo");
  const dots = document.getElementById("stDots");
  dots.innerHTML = P.map((p, i) => `<button type="button" role="tab" aria-label="${esc(p.name)}" data-i="${i}"></button>`).join("");
  function setActive(i) {
    if (i === active) return;
    active = i;
    sec.classList.toggle("st-moved", i > 0);
    const p = P[i];
    info.innerHTML = `
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.desc)}</p>
      <div class="st-row"><b>${money(p.price)}</b><button class="btn gold" type="button" data-add="${esc(p.id)}">Ajouter au panier</button></div>`;
    [...dots.children].forEach((d, k) => d.setAttribute("aria-selected", String(k === i)));
  }
  info.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (!b || !window.SaturaShop) return;
    window.SaturaShop.add(b.dataset.add);
    b.textContent = "Ajouté ✔";
    setTimeout(() => { b.textContent = "Ajouter au panier"; }, 1200);
  });
  const range = () => sec.offsetHeight - innerHeight;
  dots.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    const top = sec.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (Number(b.dataset.i) / (n - 1)) * range(), behavior: "smooth" });
  });

  function scrollPos() {
    const r = sec.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, range()), 0, 1);
    const x = p * (n - 1), i = Math.floor(x), f = x - i;
    const s = clamp((f - 0.22) / 0.56, 0, 1);
    return Math.min(n - 1, i + s * s * (3 - 2 * s)); // plateau autour de chaque produit
  }

  /* ---------- glisser pour tourner / parallaxe ---------- */
  const stick = sec.querySelector(".studio-stick");
  let sx = 0;
  canvas.addEventListener("pointerdown", (e) => { dragging = true; dragVel = 0; sx = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.classList.add("grab"); });
  canvas.addEventListener("pointermove", (e) => {
    if (dragging) { const dx = e.clientX - sx; sx = e.clientX; dragVel = dx * 0.012; dragYaw += dragVel; lastTouch = performance.now(); }
  });
  const endDrag = () => { dragging = false; canvas.classList.remove("grab"); };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  stick.addEventListener("pointermove", (e) => {
    const r = stick.getBoundingClientRect();
    par.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    par.ty = ((e.clientY - r.top) / r.height - 0.5) * -2;
  });
  stick.addEventListener("pointerleave", () => { par.tx = 0; par.ty = 0; });

  /* ---------- boucle (seulement quand la section est visible) ---------- */
  let visible = false, raf = 0, last = 0;
  function loop(now) {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    tTarget = scrollPos();
    t += (tTarget - t) * (1 - Math.exp(-dt * 6.5));
    setActive(clamp(Math.round(t), 0, n - 1));
    if (!dragging) {
      dragYaw += dragVel; dragVel *= 0.94;
      if (Math.abs(dragVel) < 0.002 && now - lastTouch > 1400) { // retour doux face au client
        const target = Math.round(dragYaw / (Math.PI * 2)) * Math.PI * 2;
        dragYaw += (target - dragYaw) * 0.04;
      }
    }
    frame(now);
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }, { rootMargin: "120px" }).observe(sec);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
  gl.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); sec.hidden = true; });

  /* ---------- démarrage : on attend les polices pour dessiner les étiquettes ---------- */
  const go = () => {
    try {
      buildProducts();
      setActive(0);
      sec.classList.add("ready");
      resize();
      start();
      window.__studio = { ready: true, products: products.length };
    } catch (err) {
      console.warn("Studio 3D :", err);
      sec.hidden = true;
    }
  };
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.race([Promise.all([document.fonts.load("600 40px 'Playfair Display'"), document.fonts.load("500 20px 'Poppins'")]), new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve();
  fontsReady.then(go, go);
})();
