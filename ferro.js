/* Ferrofluid on bordered elements, one at a time. As the pointer nears the closest bordered element,
   its fill grows spikes from the edge nearest the pointer, each leaning toward it like field lines
   meeting at a magnet, and the element drifts a few pixels toward the pointer. Nothing reacts while
   the pointer is inside a bordered element. A canvas behind the content draws the body and spikes in
   the element's own background, and a per-element filter traces its glowing border line around the
   merged shape, so the border follows every spike.
   The element's own outline is drawn in a separate channel and kept crisp, so square and small
   corners stay exactly as CSS drew them; spikes grow from points on that outline, spaced by
   distance around it, so they wrap a corner instead of piling into it, and they scale with the
   element. */
(() => {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  /* Bordered elements only, one at a time: the nearest one grows fluid and drifts toward the pointer. */
  const REACH = 170, M = 150, SPIKES = 5;
  let cands = null;

  /* Any CSS colour to RGBA, through a canvas, since computed colours can come back as color-mix results. */
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = c; probe.fillRect(0, 0, 1, 1); const d = probe.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => (.2126 * r + .7152 * g + .0722 * b) / 255;
  const pointer = { x: -999, y: -999 };
  const live = new Map();
  let raf = 0;

  /* Scrolling moves and restyles things under a still pointer, so it drives frames as well. */
  addEventListener('scroll', () => {
    if (pointer.x > -999 && !reduced.matches && !raf) raf = requestAnimationFrame(frame);
  }, { passive: true, capture: true });
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || reduced.matches) return;
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });

  /* Each fluid gets its own filter: goo merges the blobs, then a ring one border wide is cut from the
     edge of the merged shape and painted in the element's border colour, so the glowing border line
     follows every spike. The inside keeps the element's own background. */
  const NS = 'http://www.w3.org/2000/svg';
  const defs = document.querySelector('svg.defs');
  let fid = 0;
  function lineFilter(color, width) {
    const f = document.createElementNS(NS, 'filter');
    f.id = 'ferro' + (++fid);
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', '-10%'); f.setAttribute('y', '-10%'); f.setAttribute('width', '120%'); f.setAttribute('height', '120%');
    /* The canvas draws spikes in green and the body in red. Goo merges everything, then the red body
       is laid back over it unblurred, so the element's corners never soften. Fill and line colours
       are flooded in, so the channels only carry shape. */
    f.innerHTML = `
      <feGaussianBlur in="SourceAlpha" stdDeviation="3.6" result="b"/>
      <feColorMatrix in="b" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 26 -12" result="goo"/>
      <feColorMatrix in="SourceGraphic" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="red"/>
      <feComposite in="red" in2="SourceAlpha" operator="in" result="body"/>
      <feMerge result="shape"><feMergeNode in="goo"/><feMergeNode in="body"/></feMerge>
      <feFlood data-k="fill" flood-color="#000" result="paint"/>
      <feComposite in="paint" in2="shape" operator="in" result="fill"/>
      <feMorphology in="shape" operator="erode" radius="${width}" result="inner"/>
      <feComposite in="shape" in2="inner" operator="out" result="ring"/>
      <feFlood data-k="line" flood-color="${color}" result="ink"/>
      <feComposite in="ink" in2="ring" operator="in" result="line"/>
      <feMerge><feMergeNode in="fill"/><feMergeNode in="line"/></feMerge>`;
    defs.append(f);
    return f;
  }
  /* A colour as it actually shows: composited over the page behind the element, since the canvas
     must be opaque where the fluid is. */
  const behind = el => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > .95) return c;
    }
    return [5, 6, 9, 1];
  };
  const shown = (c, under) => {
    const [r, g, b, a] = rgba(c);
    return `rgb(${[r, g, b].map((v, i) => Math.round(v * a + under[i] * (1 - a))).join(' ')})`;
  };

  /* What the fluid should look like right now: size, corner, fill, and border colour all come from
     the element's current state, so it keeps up when the element morphs or changes colour. */
  function look(el) {
    const cs = getComputedStyle(el);
    const isBar = el.matches('.bar');
    const hue = cs.getPropertyValue('--hue').trim() || '#ffd9b8';
    const under = behind(el);
    const fill = shown(cs.backgroundColor, under);
    const fillRgb = rgba(fill);
    const line = isBar ? shown(hue, fillRgb) : shown(cs.borderTopColor, fillRgb);
    const w = el.offsetWidth, h = el.offsetHeight, cap = Math.min(w, h) / 2;
    const radii = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(k => Math.min(parseFloat(cs[`border${k}Radius`]) || 0, cap));
    return {
      w, h, line, fill, radii,
      glow: shown(isBar ? hue : cs.borderTopColor, [0, 0, 0]),
      width: isBar ? 1 : parseFloat(cs.borderTopWidth) || 1.5,
      bx: parseFloat(cs.borderLeftWidth) || 0, by: parseFloat(cs.borderTopWidth) || 0,
    };
  }

  /* The element's outline, sampled every pixel clockwise from the top-left, with outward normals.
     Spikes are placed by distance along it, so near a corner they wrap round instead of stacking. */
  function outline(w, h, [tl, tr, br, bl]) {
    const pts = [];
    const line = (x0, y0, x1, y1, nx, ny) => {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, nx, ny]);
    };
    const arc = (cx, cy, r, a0) => {
      const n = Math.max(3, Math.round(r * Math.PI / 2));
      for (let i = 0; i < n; i++) {
        const a = a0 + Math.PI / 2 * i / n, nx = Math.cos(a), ny = Math.sin(a);
        pts.push([cx + nx * r, cy + ny * r, nx, ny]);
      }
    };
    line(tl, 0, w - tr, 0, 0, -1); arc(w - tr, tr, tr, -Math.PI / 2);
    line(w, tr, w, h - br, 1, 0); arc(w - br, h - br, br, 0);
    line(w - br, h, bl, h, 0, 1); arc(bl, h - bl, bl, Math.PI / 2);
    line(0, h - bl, 0, tl, -1, 0); arc(tl, tl, tl, Math.PI);
    return pts;
  }

  /* The canvas is sized with headroom, so an element that grows a little (the bar morphing to fit
     new controls) does not reallocate it every frame. */
  function size(f, w, h) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    f.aw = Math.ceil(w * 1.25 + 40); f.ah = Math.ceil(h * 1.15 + 20);
    /* Absolute children start inside the border, so step back over it to line up with the outline. */
    const bl = f.bx || 0, bt = f.by || 0;
    Object.assign(f.c.style, { left: -M - bl + 'px', top: -M - bt + 'px', width: f.aw + 2 * M + 'px', height: f.ah + 2 * M + 'px' });
    f.c.width = (f.aw + 2 * M) * dpr; f.c.height = (f.ah + 2 * M) * dpr;
    f.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sync(el, f) {
    const L = look(el);
    if (L.bx !== f.bx || L.by !== f.by) { f.bx = L.bx; f.by = L.by; size(f, L.w, L.h); }
    if (L.w > f.aw || L.h > f.ah || L.w < f.aw * .6 || L.h < f.ah * .6) size(f, L.w, L.h);
    const key = `${L.w}x${L.h}:${L.radii}`;
    if (key !== f.key) { f.key = key; f.pts = outline(L.w, L.h, L.radii); }
    f.w = L.w; f.h = L.h; f.radii = L.radii;
    if (L.fill !== f.fill) { f.fill = L.fill; f.filter.querySelector('[data-k="fill"]').setAttribute('flood-color', L.fill); }
    if (L.line !== f.line) { f.line = L.line; f.filter.querySelector('[data-k="line"]').setAttribute('flood-color', L.line); }
    if (L.width !== f.lineWidth) { f.lineWidth = L.width; f.filter.querySelector('feMorphology').setAttribute('radius', L.width); }
    if (L.glow !== f.glow) { f.glow = L.glow; f.c.style.filter = `url(#${f.filter.id}) drop-shadow(0 0 10px ${L.glow})`; }
  }

  function fluidFor(el) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';
    const L = look(el);
    const c = document.createElement('canvas');
    c.className = 'ferro';
    c.setAttribute('aria-hidden', 'true');
    el.prepend(c);
    const f = { c, ctx: c.getContext('2d'), filter: lineFilter(L.line, L.width) };
    size(f, L.w, L.h);
    sync(el, f);
    return f;
  }
  const drop = s => { s.fluid.c.remove(); s.fluid.filter.remove(); };

  /* An element qualifies when it already has a full solid border it can grow from, and is not
     clipped (spikes would be cut off). The floating bar draws its border as a ring, so it is named. */
  function bordered(el) {
    if (el.closest('[aria-hidden="true"], .ferro')) return false;
    if (el.matches('.bar')) return true;
    if (el.offsetWidth < 30 || el.offsetHeight < 24) return false;
    const cs = getComputedStyle(el);
    if (cs.overflow !== 'visible') return false;
    const full = ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] === 'solid');
    return full && rgba(cs.borderTopColor)[3] > .1;
  }
  const collect = () => { cands = [...document.querySelectorAll('body *')].filter(bordered); };
  addEventListener('resize', () => { cands = null; });
  /* A new page means a new set of bordered elements, and a page may scroll inside itself. */
  document.addEventListener('page:change', () => { cands = null; for (const [el, s] of live) { s.fluid?.c.remove(); s.fluid?.filter.remove(); el.style.translate = ''; } live.clear(); });

  function frame(now) {
    raf = 0;
    if (!cands) collect();
    const t = now / 1000;
    let active = null, best = REACH, inside = false;
    const rects = new Map();
    for (const el of cands) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < -REACH || r.top > innerHeight + REACH) continue;
      const dx = Math.max(r.left - pointer.x, 0, pointer.x - r.right);
      const dy = Math.max(r.top - pointer.y, 0, pointer.y - r.bottom);
      const d = Math.hypot(dx, dy);
      rects.set(el, { r, d });
      if (d === 0) inside = true;
      else if (d < best) { best = d; active = el; }
    }
    if (inside) active = null;
    if (active && !live.has(active)) live.set(active, { amt: 0, mx: 0, my: 0, fluid: fluidFor(active) });

    let any = false;
    for (const [el, s] of live) {
      const hit = rects.get(el);
      if (!hit) { drop(s); el.style.translate = ''; live.delete(el); continue; }
      const { r, d } = hit;
      const on = el === active;
      const want = on ? Math.pow(1 - d / REACH, 1.3) : 0;
      s.amt += (want - s.amt) * .16;

      /* Drift toward the pointer, as an individual translate so it never fights the element's
         own transform. Big tiles move less than small ones. */
      const cx = r.left + r.width / 2 - s.mx, cy = r.top + r.height / 2 - s.my;
      const pull = on ? 1 - d / REACH : 0;
      const lim = Math.max(2, Math.min(8, 1000 / r.width)), limY = Math.max(1.5, Math.min(6, 400 / r.height));
      const tx = Math.max(-lim, Math.min(lim, (pointer.x - cx) * .07 * pull)), ty = Math.max(-limY, Math.min(limY, (pointer.y - cy) * .07 * pull));
      s.mx += (tx - s.mx) * .18; s.my += (ty - s.my) * .18;
      el.style.translate = `${s.mx.toFixed(2)}px ${s.my.toFixed(2)}px`;

      sync(el, s.fluid);
      draw(s, r, t);
      if (!on && s.amt < .004 && Math.abs(s.mx) < .05 && Math.abs(s.my) < .05) {
        drop(s);
        el.style.translate = '';
        live.delete(el);
        continue;
      }
      any = true;
    }
    if (any || active) raf = requestAnimationFrame(frame);
  }

  function draw(s, r, t) {
    const F = s.fluid, { ctx, w, h, radii, pts } = F, a = s.amt;
    ctx.clearRect(0, 0, F.aw + 2 * M, F.ah + 2 * M);
    F.c.classList.toggle('on', a > .01);
    if (a <= .01) return;
    /* Everything scales with the element, so a small label grows small spikes. */
    const k = Math.max(.42, Math.min(1, Math.min(w, h) / 44));
    const px = pointer.x - r.left + M, py = pointer.y - r.top + M;

    /* The outline point nearest the pointer. */
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] + M - px) ** 2 + (pts[i][1] + M - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    const N = pts.length, at = j => pts[((best + Math.round(j)) % N + N) % N];

    /* Spikes in green. Spread along the outline, at most a third of the way round each side. */
    ctx.fillStyle = 'rgb(0 255 0)';
    const n = k < .8 ? 3 : SPIKES;
    const gap = Math.max(14, Math.min(24 * k, N / (n * 2.2)));
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * gap;
      const fall = Math.exp(-((off / (46 * k)) ** 2));
      const [ox, oy, nx, ny] = at(off);
      const r0 = (6 + 5 * fall) * k * k * Math.min(1, a * 1.6) + 1.5 * (1 - k);
      const bx = ox + M - nx * r0 * .5, by = oy + M - ny * r0 * .5;
      const toP = Math.hypot(px - bx, py - by) || 1;
      /* Lean toward the pointer, but keep some of the outline's own outward direction, so spikes
         round a corner fan out instead of converging into one ramp. */
      const vx = (px - bx) / toP + nx * .7, vy = (py - by) / toP + ny * .7, vl = Math.hypot(vx, vy) || 1;
      const ux = vx / vl, uy = vy / vl;
      const len = Math.min(toP * .72, 74 * (.55 + .45 * k) * a * fall * (.88 + .12 * Math.sin(t * 4 + i * 1.7)));
      for (let q = 0; q <= 12; q++) {
        const f = q / 12, rad = r0 * (1 - f) ** 1.6 + .4;
        ctx.beginPath(); ctx.arc(bx + ux * len * f, by + uy * len * f, rad, 0, 7); ctx.fill();
      }
    }
    /* A low swell where the fluid gathers, laid along the outline so it bends round corners. */
    const reach = Math.min(34 * k, N / 6);
    for (let j = -reach; j <= reach; j += 2) {
      const [ox, oy] = at(j), g = Math.exp(-((j / reach) ** 2) * 2.2);
      ctx.beginPath(); ctx.arc(ox + M, oy + M, 9 * k * k * a * g, 0, 7); ctx.fill();
    }
    /* The body in red, last, so it is never covered: the filter keeps red unblurred. */
    ctx.fillStyle = 'rgb(255 0 0)';
    ctx.beginPath(); ctx.roundRect(M, M, w, h, radii); ctx.fill();
  }
})();
