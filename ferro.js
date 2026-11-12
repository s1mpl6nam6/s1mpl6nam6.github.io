/* Ferrofluid on bordered elements, one at a time. As the pointer nears the closest bordered element,
   its fill grows spikes from the edge nearest the pointer, each leaning toward it like field lines
   meeting at a magnet, and the element drifts a few pixels toward the pointer. Nothing reacts while
   the pointer is inside a bordered element. A canvas behind the content draws the body and spikes in
   the element's own background, and a per-element filter traces its glowing border line around the
   merged shape, so the border follows every spike. */
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
    f.innerHTML = `
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.6" result="b"/>
      <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -12" result="shape"/>
      <feMorphology in="shape" operator="erode" radius="${width}" result="inner"/>
      <feComposite in="shape" in2="inner" operator="out" result="ring"/>
      <feFlood flood-color="${color}" result="ink"/>
      <feComposite in="ink" in2="ring" operator="in" result="line"/>
      <feMerge><feMergeNode in="shape"/><feMergeNode in="line"/></feMerge>`;
    defs.append(f);
    return f;
  }
  const opaque = c => { const [r, g, b] = rgba(c); return `rgb(${r} ${g} ${b})`; };

  /* What the fluid should look like right now: size, corner, fill, and border colour all come from
     the element's current state, so it keeps up when the element morphs or changes colour. */
  function look(el) {
    const cs = getComputedStyle(el);
    const isBar = el.matches('.bar');
    const hue = cs.getPropertyValue('--hue').trim() || '#ffd9b8';
    const line = opaque(isBar ? `color-mix(in srgb, ${hue} 60%, transparent)` : cs.borderTopColor);
    const w = el.offsetWidth, h = el.offsetHeight;
    return {
      w, h, line,
      glow: opaque(isBar ? hue : cs.borderTopColor),
      fill: opaque(cs.backgroundColor),
      width: isBar ? 1 : parseFloat(cs.borderTopWidth) || 1.5,
      radius: Math.min(parseFloat(cs.borderTopLeftRadius) || 0, h / 2),
    };
  }

  /* The canvas is sized with headroom, so an element that grows a little (the bar morphing to fit
     new controls) does not reallocate it every frame. */
  function size(f, w, h) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    f.aw = Math.ceil(w * 1.25 + 40); f.ah = Math.ceil(h * 1.15 + 20);
    Object.assign(f.c.style, { left: -M + 'px', top: -M + 'px', width: f.aw + 2 * M + 'px', height: f.ah + 2 * M + 'px' });
    f.c.width = (f.aw + 2 * M) * dpr; f.c.height = (f.ah + 2 * M) * dpr;
    f.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sync(el, f) {
    const L = look(el);
    if (L.w > f.aw || L.h > f.ah || L.w < f.aw * .6 || L.h < f.ah * .6) size(f, L.w, L.h);
    f.w = L.w; f.h = L.h; f.radius = L.radius; f.color = L.fill;
    if (L.line !== f.line) { f.line = L.line; f.filter.querySelector('feFlood').setAttribute('flood-color', L.line); }
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
    const { ctx, w, h, color, radius } = s.fluid, a = s.amt;
    ctx.clearRect(0, 0, s.fluid.aw + 2 * M, s.fluid.ah + 2 * M);
    s.fluid.c.classList.toggle('on', a > .01);
    if (a <= .01) return;
    ctx.fillStyle = color;
    /* The body, identical to the button, so spikes grow out of it seamlessly. */
    ctx.beginPath(); ctx.roundRect(M, M, w, h, radius); ctx.fill();

    /* Pointer and nearest edge point, in canvas space. */
    const px = pointer.x - r.left + M, py = pointer.y - r.top + M;
    const qx = Math.min(Math.max(px, M), M + w), qy = Math.min(Math.max(py, M), M + h);
    const dist = Math.hypot(px - qx, py - qy) || 1;
    const nx = (px - qx) / dist, ny = (py - qy) / dist, tx = -ny, ty = nx;

    for (let i = 0; i < SPIKES; i++) {
      const off = (i - (SPIKES - 1) / 2) * 24;
      const fall = Math.exp(-((off / 46) ** 2));
      let bx = qx + tx * off - nx * 4, by = qy + ty * off - ny * 4;
      bx = Math.min(Math.max(bx, M + 4), M + w - 4); by = Math.min(Math.max(by, M + 4), M + h - 4);
      const toP = Math.hypot(px - bx, py - by) || 1;
      const ux = (px - bx) / toP, uy = (py - by) / toP;
      const len = Math.min(toP - 5, 74 * a * fall * (.88 + .12 * Math.sin(t * 4 + i * 1.7)));
      const r0 = (6 + 5 * fall) * Math.min(1, a * 1.6);
      for (let k = 0; k <= 12; k++) {
        const f = k / 12, rad = r0 * (1 - f) ** 1.6 + .4;
        ctx.beginPath(); ctx.arc(bx + ux * len * f, by + uy * len * f, rad, 0, 7); ctx.fill();
      }
    }
    /* A low swell under the spikes, where the fluid gathers. */
    ctx.beginPath(); ctx.ellipse(qx, qy, 34 * a, 12 * a, Math.atan2(ty, tx), 0, 7); ctx.fill();
  }
})();
