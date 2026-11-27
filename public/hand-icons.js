// hand-icons.js: the Figma v5 drawings, alive.
// Every [data-draw] element gets its drawing from /assets/v5/<name>.svg, redrawn as
// polylines that "boil" (tiny per-point jitter, 3 drawings cycled at 12fps).
// Extra moves, drawn every frame: the eye follows the cursor and blinks (closed when the
// visualiser is off), the bug walks its legs, the moon morphs + spins into the sun when
// the theme flips (crisp: no boil mid-morph). [data-still] lines are drawn once, no boil.
// Pauses with the tab (requestAnimationFrame); reduced motion = still drawings, instant swaps.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const BOIL_FPS = 12;
  const MORPH_MS = 480; // matches the theme wash in app.js
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = Math.PI / 180;
  const items = [];
  let frameNo = 0;

  // ── drawings ────────────────────────────────────────────────────────────
  const cache = {};
  const load = name => (cache[name] ||= fetch(`/assets/v5/${name}.svg`).then(r => r.text()).then(parse));

  function parse(txt) {
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const vb = doc.documentElement.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    const subs = [];
    let sw = 1.6;
    doc.querySelectorAll('path').forEach(p => {
      if (p.closest('clipPath')) return;
      sw = Number(p.getAttribute('stroke-width')) || sw;
      subs.push(...parseD(p.getAttribute('d')));
    });
    return { vb, sw, subs };
  }

  // Figma exports absolute M/L/H/V/Z polylines
  function parseD(d) {
    const out = [];
    let cur = null, x = 0, y = 0, m;
    const re = /([MLHVZ])([^MLHVZ]*)/g;
    while ((m = re.exec(d))) {
      const n = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
      if (m[1] === 'M') { cur = []; out.push(cur); }
      if (m[1] === 'M' || m[1] === 'L') for (let i = 0; i < n.length; i += 2) { x = n[i]; y = n[i + 1]; cur.push([x, y]); }
      if (m[1] === 'H') n.forEach(v => { x = v; cur.push([x, y]); });
      if (m[1] === 'V') n.forEach(v => { y = v; cur.push([x, y]); });
      if (m[1] === 'Z' && cur) cur.closed = true;
    }
    return out;
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  const hash = (a, b, c) => {
    let h = (a * 374761393 + b * 668265263 + c * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
  };
  const rot = ([x, y], [ox, oy], a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c];
  };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const withFlag = (pts, src) => { pts.closed = src.closed; return pts; };
  const toD = subs => subs.map(p =>
    'M' + p.map(q => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L') + (p.closed ? 'Z' : '')).join('');

  // even points around a loop, starting nearest angle a0 from c, clockwise
  function resample(pts, n, c, a0) {
    let p = pts.slice();
    const area = p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0);
    if (area < 0) p.reverse();
    let best = 0, bestD = Infinity;
    p.forEach((q, i) => {
      const d = Math.abs(((Math.atan2(q[1] - c[1], q[0] - c[0]) - a0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
      if (d < bestD) { bestD = d; best = i; }
    });
    p = p.slice(best).concat(p.slice(0, best));
    p.push(p[0]);
    const len = [0];
    for (let i = 1; i < p.length; i++) len.push(len[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const total = len[len.length - 1];
    return Array.from({ length: n }, (_, k) => {
      const t = total * k / n;
      let i = 1;
      while (len[i] < t) i++;
      return lerp(p[i - 1], p[i], (t - len[i - 1]) / (len[i] - len[i - 1] || 1));
    });
  }

  // ── pointer, for the eye ────────────────────────────────────────────────
  let mx = null, my = null;
  window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mx = e.clientX; my = e.clientY; } }, { passive: true });

  // ── moves ───────────────────────────────────────────────────────────────
  const anims = {
    // pupil follows the cursor, blinks every few seconds, shut when VIS is off
    'nav-eye': {
      ox: 0, oy: 0, nextBlink: 0, blinkAt: -1e9, last: 0,
      live: () => true,
      draw(it, now) {
        const [outline, pupil] = it.shapes[0].subs;
        const on = !document.body.classList.contains('vis-off');
        if (!reduce && now >= this.nextBlink) { this.blinkAt = now; this.nextBlink = now + 2500 + Math.random() * 4500; }
        const b = (now - this.blinkAt) / 240;
        let open = on ? 1 : 0.12;
        if (on && b >= 0 && b < 1) open = Math.max(0.12, Math.abs(1 - 2 * b));

        let tx = 0, ty = 0;
        if (!reduce && mx !== null) {
          const r = it.el.getBoundingClientRect();
          const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2), dist = Math.hypot(dx, dy) || 1;
          const pull = Math.min(1, dist / 120);
          tx = dx / dist * pull * 5;
          ty = dy / dist * pull * 2.6;
        } else if (!reduce) {
          tx = 3.5 * Math.sin(now / 1300); ty = Math.sin(now / 1900);
        }
        const f = 1 - Math.exp(-(now - (this.last || now)) / 70);
        this.last = now;
        this.ox += (tx - this.ox) * f;
        this.oy += (ty - this.oy) * f;

        const squash = q => [q[0], 20 + (q[1] - 20) * open];
        const s = [withFlag(outline.map(squash), outline)];
        if (open > 0.35) s.push(withFlag(pupil.map(q => squash([q[0] + this.ox, q[1] + this.oy])), pupil));
        return { subs: s };
      },
    },

    // walks its legs on the spot (tripod gait), faster on hover or while the report is open
    'nav-bug': {
      ph: 0, last: 0,
      live: () => true,
      draw(it, now) {
        const btn = it.el.closest('button');
        const fast = it.hover || (btn && btn.classList.contains('is-active'));
        if (!reduce) this.ph += (now - (this.last || now)) * (fast ? 0.014 : 0.005);
        this.last = now;
        const ph = this.ph, bob = reduce ? 0 : Math.sin(ph * 2) * 0.4;
        const [body, ...rest] = it.shapes[0].subs;
        const up = q => [q[0], q[1] + bob];
        const s = [withFlag(body.map(up), body)];
        rest.forEach((limb, i) => {
          const base = limb[0];
          let a;
          if (i < 6) { // legs: 0-2 left, 3-5 right
            const side = i < 3 ? -1 : 1, grp = (i % 3 + (side > 0 ? 1 : 0)) % 2;
            a = side * Math.sin(ph + grp * Math.PI) * 16 * D;
          } else {     // antennae
            a = (i === 6 ? -1 : 1) * Math.sin(ph * 1.3) * 8 * D;
          }
          s.push(limb.map(q => up(rot(q, base, a))));
        });
        return { subs: s };
      },
    },

    // moon in DARK, sun in LIGHT: the crescent morphs into the sun's body while it spins
    // and the rays grow out. Starts on the click, runs every frame, no boil until it lands.
    theme: {
      m: null, from: 0, to: 0, t0: 0,
      target() {
        const r = document.documentElement;
        return (r.getAttribute('data-skin-target') || r.getAttribute('data-skin')) === 'LIGHT' ? 1 : 0;
      },
      live() { return this.m !== this.target(); },
      draw(it, now) {
        const [moon, sun] = it.shapes;
        if (!this.moonPts) {
          const N = 24, c = [20, 20];
          this.moonPts = resample(moon.subs[0], N, c, -60 * D);
          this.sunPts = resample(sun.subs[0], N, c, -60 * D);
          this.rays = sun.subs.slice(1).map(r => {
            const inner = Math.hypot(r[0][0] - 20, r[0][1] - 20) < Math.hypot(r[r.length - 1][0] - 20, r[r.length - 1][1] - 20);
            return inner ? r : r.slice().reverse();
          });
        }
        const target = this.target();
        if (this.m === null) this.m = this.from = this.to = target;
        if (target !== this.to) { this.from = this.m; this.to = target; this.t0 = now; }
        const k = reduce ? 1 : Math.min(1, (now - this.t0) / MORPH_MS);
        const m = (this.m = this.from + (this.to - this.from) * ease(k));
        const c = [20, 20];
        const idle = reduce ? 0 : (1 - m) * Math.sin(now / 900) * 7 * D;
        const spin = m * Math.PI + idle;
        const bodyPts = this.moonPts.map((p, i) => rot(lerp(p, this.sunPts[i], m), c, spin));
        bodyPts.closed = true;
        const s = [bodyPts];
        if (m > 0.02) {
          const turn = reduce ? 0 : now / 2500;
          this.rays.forEach(r => s.push(r.map(q => rot(lerp(r[0], q, m), c, spin / 2 + turn - Math.PI / 2))));
        }
        return { subs: s, sw: moon.sw + (sun.sw - moon.sw) * m, crisp: k < 1 };
      },
    },

    // speaker: crossed out while the sound is off
    speaker: {
      draw(it) {
        const off = !!it.el.closest('.sound-off');
        return { subs: it.shapes[off ? 1 : 0].subs };
      },
    },
  };

  const sources = { theme: ['nav-moon', 'nav-sun'], speaker: ['speaker-on', 'speaker-off'] };

  // ── mount + render ──────────────────────────────────────────────────────
  function mount(el) {
    const kind = el.dataset.draw;
    Promise.all((sources[kind] || [kind]).map(load)).then(shapes => {
      const { vb, sw } = shapes[0];
      const line = el.classList.contains('drawn-line');
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', vb.join(' '));
      svg.setAttribute('preserveAspectRatio', line ? 'none' : 'xMidYMid meet');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('stroke-width', sw);
      if (line) path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(path);
      el.replaceChildren(svg);
      el.classList.add('is-drawn');

      const it = {
        el, path, shapes, kind,
        still: el.hasAttribute('data-still'),
        anim: anims[kind],
        seed: 11 + items.length * 17,
        // boil size: ~1.5% of the drawing, a touch less on the long underlines
        amp: line ? 0.45 : Math.min(vb[2], vb[3]) * 0.015,
        hover: false,
      };
      const btn = el.closest('button');
      if (btn) {
        btn.addEventListener('mouseenter', () => { it.hover = true; });
        btn.addEventListener('mouseleave', () => { it.hover = false; });
      }
      items.push(it);
      render(it, performance.now());
      it.drawn = true;
    }).catch(err => console.warn('[hand-icons]', kind, err));
  }

  function render(it, now) {
    const out = it.anim ? it.anim.draw(it, now) : { subs: it.shapes[0].subs };
    const k = frameNo % 3;
    const subs = (reduce || it.still || out.crisp) ? out.subs : out.subs.map((p, j) => withFlag(p.map(([x, y], i) =>
      [x + hash(i, k, it.seed + j * 31) * it.amp, y + hash(i, k, it.seed + j * 31 + 7) * it.amp]), p));
    it.path.setAttribute('d', toD(subs));
    if (out.sw) it.path.setAttribute('stroke-width', out.sw.toFixed(2));
  }

  // boil steps at 12fps; moving parts (eye, bug, a morphing moon) redraw every frame
  // the boombox png boils through an SVG displacement filter: same clock, new noise seed
  const noises = [...document.querySelectorAll('.boil-noise')];
  if (reduce) document.querySelectorAll('.boil-shift').forEach(d => d.setAttribute('scale', '0'));
  const boomboxes = [...document.querySelectorAll('.boombox')];

  function frame(now = performance.now()) {
    const step = Math.floor(now * BOIL_FPS / 1000);
    const boilTick = step !== frameNo;
    frameNo = step;
    if (boilTick && boomboxes.some(b => b.getClientRects().length)) {
      noises.forEach(n => n.setAttribute('seed', String(step % 3 + 1)));
    }
    items.forEach(it => {
      if (it.still && it.drawn) return;
      if (!boilTick && !(it.anim && it.anim.live && it.anim.live())) return;
      if (!it.el.getClientRects().length) return;
      render(it, now);
      it.drawn = true;
    });
  }

  document.querySelectorAll('[data-draw]').forEach(mount);

  if (reduce) {
    // still drawings: just redraw when a state changes
    const mo = new MutationObserver(() => frame());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'data-skin-target'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  } else {
    const loop = now => { frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
})();
