/* Motion: three agent cursors draw a box for each element, the element appears in it, and the box goes. main.js owns state, this file owns motion.
   Follows GSAP's own guidance: transforms and opacity, one timeline per sequence,
   ScrollTrigger only on top-level animations, and matchMedia for reduced motion. */
(() => {
  if (!window.gsap) { document.documentElement.classList.remove('pre'); return; }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  document.documentElement.dataset.motion = '1';
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* A striking neon tube: a few fast uneven pulses, then steady. Under three flashes a second per letter group. */
  const strike = (targets, stagger = { each: .022, from: 'random' }) => gsap.fromTo(targets, { opacity: .07 }, {
    keyframes: [
      { opacity: .85, duration: .05 }, { opacity: .16, duration: .1 },
      { opacity: 1, duration: .05 }, { opacity: .42, duration: .14 }, { opacity: 1, duration: .1 },
    ],
    ease: 'none', stagger,
  });

  /* The field: seven filaments, one per project, drawn in a fragment shader so glow falls off as real light. */
  /* The light lives in light.js with its own render loop, so nothing here can stop it rendering. */
  const field = () => window.light || null;

  /* The crew. Each cursor draws a box from corner to corner, the element appears inside it,
     and the box goes. Everything that moves is a transform, an opacity, or a clip, so the
     work stays on the compositor and no custom property is animated. */
  const ROLES = { copy: '#ff4d7d', layout: '#22e6ff', data: '#c6ff2e', light: '#ffb300' };
  const ARROW = '<svg viewBox="0 0 20 22"><path d="M2 1.5 L2 18 L6.6 13.8 L9.6 20.5 L12.6 19.2 L9.7 12.6 L16 12.4 Z"/></svg>';
  const PAD = 10, BLEED = 220;

  /* Position inside the sheet, from layout offsets, so the sheet's own scale never skews it. */
  const rel = (el, sheet) => {
    let x = 0, y = 0;
    for (let e = el; e && e !== sheet; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };

  function cursor(sheet, role) {
    const el = document.createElement('div');
    el.className = 'agent';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--c', ROLES[role]);
    el.innerHTML = `${ARROW}<span>${role}</span><i class="ping"></i>`;
    sheet.append(el);
    return el;
  }

  const press = el => gsap.timeline()
    .to(el, { scale: .82, duration: .07, ease: 'power2.out' })
    .fromTo(el.querySelector('.ping'), { scale: .2, opacity: .9 }, { scale: 2.4, opacity: 0, duration: .3, ease: 'power2.out' }, 0);

  /* A whole element is hidden by a clip that keeps its glow room, then wiped in left to right. */
  const hidden = el => `inset(-${BLEED}px ${el.offsetWidth + BLEED}px -${BLEED}px -${BLEED}px)`;
  const shown = `inset(-${BLEED}px -${BLEED}px -${BLEED}px -${BLEED}px)`;

  /* Glitch: a few slices of the element jump sideways with a cyan and magenta split, then it settles.
     Text and small tiles only, about a fifth of a second, so nothing large flashes. */
  const SPLIT = d => `${d}px 0 #ff2bd6, ${-d}px 0 #2bf0ff`;
  const band = (top, bottom) => `inset(${top}% -${BLEED}px ${bottom}% -${BLEED}px)`;
  const FRAMES = [[band(0, 62), 9], [band(38, 18), -12], [band(0, 0), 4], [band(22, 48), -6]];
  function glitch(tl, els, at, step = .035) {
    FRAMES.forEach(([clip, dx], i) => tl.set(els, { clipPath: clip, x: dx, textShadow: SPLIT(dx / 3) }, at + i * step));
    tl.set(els, { clipPath: shown, x: 0, textShadow: '' }, at + FRAMES.length * step);
  }

  /* ASCII draw-in, as diffusion. When a cursor finishes its box, the elements it is drawing are
     painted, hidden, into a map: their text in its real font and colour, their backgrounds and
     borders. Every character cell takes a target from that map, a glyph from its brightness and
     a colour from its pixels. The box starts as faint noise; cell by cell the noise settles into
     its target, so the shape reads in ASCII; then the ASCII fades into the real element. */
  const GLYPHS = ' .:-=+*#%@';
  const NOISE = '.:-=+*#%@<>/\\|';
  const sample = (els, sheet, R) => {
    const W = Math.max(1, Math.ceil(R.w)), H = Math.max(1, Math.ceil(R.h));
    const m = document.createElement('canvas'); m.width = W; m.height = H;
    const g = m.getContext('2d', { willReadFrequently: true });
    const S = sheet.getBoundingClientRect(), ox = S.left + R.x - sheet.scrollLeft, oy = S.top + R.y - sheet.scrollTop;
    const paint = el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      const bg = cs.backgroundColor;
      if (bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg)) { g.fillStyle = bg; g.fillRect(r.left - ox, r.top - oy, r.width, r.height); }
      const bw = parseFloat(cs.borderTopWidth);
      if (bw > 0 && cs.borderTopStyle !== 'none') { g.strokeStyle = cs.borderTopColor; g.lineWidth = Math.max(1.5, bw); g.strokeRect(r.left - ox, r.top - oy, r.width, r.height); }
      for (const node of el.childNodes) {
        if (node.nodeType === 1) { paint(node); continue; }
        if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
        /* Text: each character drawn at its real place and size, so the map matches the layout. */
        const k = el.offsetHeight ? r.height / el.offsetHeight : 1;
        g.fillStyle = cs.color;
        g.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * k}px ${cs.fontFamily}`;
        g.textBaseline = 'middle'; g.textAlign = 'center';
        const range = document.createRange(), t = node.nodeValue;
        for (let i = 0; i < t.length; i++) {
          if (t[i] === ' ') continue;
          range.setStart(node, i); range.setEnd(node, i + 1);
          const c = range.getBoundingClientRect();
          if (c.width) g.fillText(t[i], c.left - ox + c.width / 2, c.top - oy + c.height / 2);
        }
      }
    };
    els.forEach(paint);
    return { data: g.getImageData(0, 0, W, H).data, W, H };
  };
  function asciiIn(sheet, R, els, tint) {
    const c = document.createElement('canvas');
    c.className = 'ascii-in';
    c.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    /* Cells scale with the box, so a large demo stays near 2,600 cells. */
    const CW = Math.max(7, Math.sqrt(R.w * R.h / 2600 * .6)), CH = CW / .6;
    const cols = Math.max(1, Math.ceil(R.w / CW)), rows = Math.max(1, Math.ceil(R.h / CH)), n = cols * rows;
    c.width = Math.ceil(cols * CW * dpr); c.height = Math.ceil(rows * CH * dpr);
    Object.assign(c.style, { width: cols * CW + 'px', height: rows * CH + 'px' });
    gsap.set(c, { x: R.x, y: R.y });
    sheet.append(c);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.font = `600 ${Math.round(CH * .78)}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    /* Targets from the map: brightness picks the glyph, the pixels pick its colour. */
    const map = sample(els, sheet, R);
    const glyph = new Array(n), color = new Array(n), lum = new Float32Array(n), settle = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x0 = Math.floor((i % cols) * CW), y0 = Math.floor(Math.floor(i / cols) * CH);
      let a = 0, rr = 0, gg = 0, bb = 0, k = 0;
      for (let y = y0; y < Math.min(map.H, y0 + CH); y += 2) for (let x = x0; x < Math.min(map.W, x0 + CW); x += 2) {
        const o = (y * map.W + x) * 4, al = map.data[o + 3] / 255;
        a += al; rr += map.data[o] * al; gg += map.data[o + 1] * al; bb += map.data[o + 2] * al; k++;
      }
      const cover = k ? a / k : 0;
      lum[i] = Math.min(1, cover * 1.6);
      glyph[i] = GLYPHS[Math.min(GLYPHS.length - 1, Math.round(lum[i] * (GLYPHS.length - 1)))];
      color[i] = a ? `rgb(${rr / a | 0} ${gg / a | 0} ${bb / a | 0})` : tint;
      settle[i] = .15 + .7 * Math.random();
    }
    return {
      to(p) {
        g.clearRect(0, 0, cols * CW, rows * CH);
        for (let i = 0; i < n; i++) {
          const x = (i % cols) * CW + CW / 2, y = Math.floor(i / cols) * CH + CH / 2;
          if (p >= settle[i]) {
            /* Settled: the cell shows what is really there, faintly twitching as it lands. */
            if (lum[i] < .04) continue;
            const fresh = p - settle[i] < .08;
            g.globalAlpha = .35 + .65 * lum[i];
            g.fillStyle = color[i];
            g.fillText(fresh && Math.random() < .5 ? NOISE[(Math.random() * NOISE.length) | 0] : glyph[i], x, y);
          } else {
            /* Noise, thinning out as the picture forms. */
            const density = .5 * (1 - p);
            if (Math.random() > density) continue;
            g.globalAlpha = .12 + .3 * Math.random();
            g.fillStyle = Math.random() < p ? color[i] : tint;
            g.fillText(NOISE[(Math.random() * NOISE.length) | 0], x, y);
          }
        }
        g.globalAlpha = 1;
      },
      el: c,
      remove: () => c.remove(),
    };
  }
  /* What a cursor is making decides its colour: text takes its own colour, anything else the
     section's neon. */
  const colourOf = (els, sheet) => {
    const t = els.find(e => e.matches('h1, h2, p, a, .hero-name *, [class*="name"]'));
    if (t) return getComputedStyle(t).color;
    return getComputedStyle(sheet).getPropertyValue('--neon').trim() || '#ffd9b8';
  };

  function drawBox(tl, sheet, cur, targets, at, role, glitchy = false, measureBy = rel) {
    const els = targets.filter(e => e && e.offsetParent);
    if (!els.length) return at;
    const box = document.createElement('div');
    box.className = 'marquee';
    box.setAttribute('aria-hidden', 'true');
    box.style.setProperty('--c', ROLES[role]);
    sheet.append(box);
    const R = { x: 0, y: 0, w: 0, h: 0 };
    const measure = () => {
      const r = els.map(e => measureBy(e, sheet));
      R.x = Math.min(...r.map(a => a.x)) - PAD; R.y = Math.min(...r.map(a => a.y)) - PAD;
      R.w = Math.max(...r.map(a => a.x + a.w)) + PAD - R.x; R.h = Math.max(...r.map(a => a.y + a.h)) + PAD - R.y;
      gsap.set(box, { x: R.x, y: R.y });
    };
    measure();
    ScrollTrigger.addEventListener('refreshInit', measure);
    gsap.set(box, { autoAlpha: 0, width: 0, height: 0 });
    gsap.set(els, { clipPath: (i, el) => hidden(el) });

    /* Every step has an explicit time, so the three cursors really work at once. */
    const label = { p: 0 }, fill = { p: 0 };
    let fx = null;
    /* Positions are read when the cursor starts this box, not when the build was planned, so
       anything that moved since (a font arriving, text re-wrapping) is drawn where it really is. */
    tl.call(measure, null, at);
    /* The cursor and its box take the colour of what they are making. */
    const tint = colourOf(els, sheet);
    box.style.setProperty('--c', tint);
    tl.call(() => cur.style.setProperty('--c', tint), null, at);
    const down = at + .5, drawn = down + .85, n = els.length;
    tl.to(cur, { x: () => R.x, y: () => R.y, duration: .5 }, at)
      .add(press(cur), down)
      .set(box, { autoAlpha: 1 }, down)
      .to(box, { width: () => R.w, height: () => R.h, duration: .75, ease: 'power1.inOut' }, down + .1)
      .to(label, { p: 1, duration: .75, ease: 'power1.inOut', onUpdate: () => { box.dataset.size = `${Math.round(R.w * label.p)} × ${Math.round(R.h * label.p)}`; } }, down + .1)
      .to(cur, { x: () => R.x + R.w, y: () => R.y + R.h, duration: .75, ease: 'power1.inOut' }, down + .1)
      .to(cur, { scale: 1, duration: .08 }, drawn)
      /* The element is uncovered at once, under a box full of characters that then clear away. */
      .call(() => { measure(); fx?.remove(); fx = asciiIn(sheet, R, els, tint); fx.to(0); }, null, drawn)
      .to(fill, { p: 1, duration: 1.05, ease: 'power1.inOut', onUpdate: () => fx?.to(fill.p) }, drawn)
      /* Then the ASCII becomes the thing: the element arrives as the characters fade. */
      .set(els, { clipPath: shown, opacity: 0 }, drawn + .95)
      .to(els, { opacity: 1, duration: .35, ease: 'power1.out' }, drawn + .95)
      .call(() => { if (fx) gsap.to(fx.el, { opacity: 0, duration: .35, ease: 'power1.in', onComplete: fx.remove }); fx = null; }, null, drawn + 1.0);
    let done = drawn + 1.32;
    if (glitchy) { glitch(tl, els, done); done += FRAMES.length * .035 + .035; }
    tl.to(box, { autoAlpha: 0, duration: .22, ease: 'none' }, done - .12);
    return done + .1;
  }

  /* plan: for each cursor, the boxes it draws in order. Each box is a list of elements. */
  function build({ sheet, plan, extra, scrollTrigger, onBox, starts = { copy: .05, layout: .35, data: .7 } }) {
    const roles = Object.keys(plan).filter(r => plan[r].length);
    const crew = Object.fromEntries(roles.map(r => [r, cursor(sheet, r)]));
    const all = Object.values(crew);
    /* Each cursor waits just off its own edge of the sheet. */
    const HOME = {
      copy: () => ({ x: sheet.offsetWidth + 40, y: Math.min(sheet.offsetHeight, innerHeight) * .2 }),
      layout: () => ({ x: -150, y: Math.min(sheet.offsetHeight, innerHeight) * .55 }),
      /* Off the left edge, not below: below the page would add scrollable space to it. */
      data: () => ({ x: -150, y: Math.min(sheet.offsetHeight, innerHeight) * .88 }),
    };
    const home = i => HOME[roles[i]]();
    gsap.set(all, { autoAlpha: 0, x: i => home(i).x, y: i => home(i).y });

    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' }, scrollTrigger, paused: !scrollTrigger });
    tl.set(all, { autoAlpha: 1 }, 0);
    let end = 0;
    roles.forEach(role => {
      let t = starts[role];
      plan[role].forEach((els, i) => {
        t = drawBox(tl, sheet, crew[role], els, t, role);
        if (onBox) onBox(tl, role, i, t);
        if (extra && role === 'data' && i === 0) extra(tl, t - .3);
        t += .05;
      });
      end = Math.max(end, t);
    });
    tl.to(all, { x: i => home(i).x, y: i => home(i).y, duration: .6, ease: 'power2.in', stagger: .05 }, end)
      .set(all, { autoAlpha: 0 });
    return { tl, crew, roles, plan, home: r => HOME[r]() };
  }

  /* Teardown: each cursor comes back, right-clicks one of its elements, picks Delete from a
     context menu, and the element switches off like an old screen, to a line and then a dot. */
  function contextMenu(sheet) {
    const m = document.createElement('div');
    m.className = 'ctx';
    m.setAttribute('aria-hidden', 'true');
    m.innerHTML = '<span>Copy</span><span>Inspect</span><span class="del">Delete</span>';
    sheet.append(m);
    gsap.set(m, { autoAlpha: 0 });
    return m;
  }
  function teardown(b, sheet, onDone) {
    const tl = gsap.timeline({ onComplete: onDone });
    const menus = [];
    b.roles.forEach((role, ri) => {
      const cur = b.crew[role], home = b.home(role);
      let t = ri * .18;
      tl.set(cur, { autoAlpha: 1, x: home.x, y: home.y, scale: 1 }, 0);
      [...b.plan[role]].reverse().forEach(group => {
        const els = group.filter(e => e && e.offsetParent);
        if (!els.length) return;
        const r = els.map(e => rel(e, sheet));
        const x0 = Math.min(...r.map(a => a.x)), y0 = Math.min(...r.map(a => a.y));
        const x1 = Math.max(...r.map(a => a.x + a.w)), y1 = Math.max(...r.map(a => a.y + a.h));
        const px = x0 + (x1 - x0) * .55, py = y0 + Math.min((y1 - y0) * .5, 70);
        const menu = contextMenu(sheet), del = menu.querySelector('.del');
        menus.push(menu);
        tl.to(cur, { x: px, y: py, duration: .42, ease: 'power2.inOut' }, t)
          .add(press(cur), t + .42)
          .set(menu, { x: px + 8, y: py + 8, autoAlpha: 1, scale: .92, transformOrigin: '0 0' }, t + .46)
          .to(menu, { scale: 1, duration: .14, ease: 'power3.out' }, t + .46)
          .to(cur, { scale: 1, duration: .06 }, t + .5)
          .to(cur, { x: px + 26, y: py + 8 + del.offsetTop + del.offsetHeight / 2, duration: .26, ease: 'power2.out' }, t + .62)
          .call(() => del.classList.add('hot'), null, t + .82)
          .add(press(cur), t + .92)
          .set(menu, { autoAlpha: 0 }, t + .98)
          .to(cur, { scale: 1, duration: .06 }, t + 1)
          .to(els, { scaleY: .015, duration: .16, ease: 'power3.in', transformOrigin: '50% 50%' }, t + 1)
          .to(els, { scaleX: 0, opacity: 0, duration: .14, ease: 'power2.in' }, t + 1.17);
        t += 1.36;
      });
      tl.to(cur, { x: home.x, y: home.y, duration: .45, ease: 'power2.in' }, t).set(cur, { autoAlpha: 0 }, t + .45);
    });
    tl.menus = menus;
    return tl;
  }

  /* The seven lights are the seven resume pages, in shader order. Contact has no light of its own. */
  const LIGHTS = [
    ['remitly', 'Remitly', '#ffb300'], ['school', 'Education', '#2dff9e'], ['emg', 'sEMG paper', '#ff4d7d'],
    ['skills', 'Skills', '#b7c8ff'], ['symphony', 'Symphony', '#22e6ff'], ['sentry', 'Smart Sentry', '#8390ff'], ['sloth', 'SlothLab', '#c6ff2e'],
  ];
  const lightOf = id => LIGHTS.findIndex(l => l[0] === id);
  /* How the light looks behind each page: home shows every light as ASCII; a project page keeps its
     own beam and leaves the others faint; Contact leaves all of them faint. */
  const ZOOM = 5.5, LIFT = .1;
  const lookFor = id => {
    if (id === 'top') return { solo: -1, dim: 0, ascii: 0, power: 1, speed: 1 };
    const i = lightOf(id);
    return i >= 0 ? { solo: i, dim: 1, ascii: 0, power: .85, speed: .35 } : { solo: -1, dim: .75, ascii: 0, power: .8, speed: 1 };
  };
  /* The camera for a page: home and Contact see the whole field; a project page holds its own
     light, magnified, at a point just above the middle of the screen. */
  const cameraFor = id => {
    const i = lightOf(id);
    return id !== 'top' && i >= 0 ? { zoom: ZOOM, ax: 0, ay: .04, track: i } : { zoom: 1, ax: 0, ay: LIFT, fx: 0, fy: 0, track: -1 };
  };
  const page = () => root.dataset.page || 'top';

  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: reduce)', () => {
    const f = field();
    if (f) { f.state.power = 1; f.draw(); }
    const sync = () => { if (f) { Object.assign(f.state, lookFor(page()), cameraFor(page())); f.draw(); } };
    sync();
    document.addEventListener('page:change', sync);
    return () => document.removeEventListener('page:change', sync);
  });

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const f = field();
    gsap.fromTo('#wire', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });

    /* Home starts as only the name, and each of its letters is put there by a cursor. */
    const hero = $('.hero'), bar = $('#bar'), nameEl = $('.hero-name'), cue = $('.scroll-cue');
    root.classList.remove('pre');
    if (f) { f.state.claimed = true; f.state.power = 0; }
    /* The reveal, scrubbed by scrolling: the name shrinks to the top centre, the lights power
       up behind it, the cue fades, and the labels appear once the lights are fully on. The page
       itself never scrolls, so wheel, touch, and keys drive the progress directly. */
    const centre = () => {
      gsap.set(nameEl, { clearProps: 'transform' });
      const r = nameEl.getBoundingClientRect();
      return { x: innerWidth / 2 - (r.left + r.width / 2), y: innerHeight * .46 - (r.top + r.height / 2), s: Math.min(innerWidth * .66 / r.width, innerHeight * .34 / r.height) };
    };
    let C = centre();
    const reveal = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    reveal.fromTo(nameEl, { x: () => C.x, y: () => C.y, scale: () => C.s }, { x: 0, y: 0, scale: 1, duration: 1, ease: 'power2.inOut' }, 0)
      .fromTo(cue, { autoAlpha: 1 }, { autoAlpha: 0, duration: .25 }, 0);
    if (f) reveal.fromTo(f.state, { power: 0 }, { power: 1, duration: .75, ease: 'power1.in' }, .2);
    reveal.progress(0);
    /* invalidate() alone does not redraw at an unchanged progress, so force the render. */
    const recentre = () => { C = centre(); reveal.invalidate(); reveal.render(reveal.totalTime(), true, true); };
    addEventListener('resize', recentre);
    /* The name's size depends on its font, so measure again once the font is in. */
    document.fonts?.ready.then(recentre);
    let want = 0;
    /* Scrolling scrubs the reveal; when the scrolling stops, it settles: past a third it finishes,
       short of that it returns to the name. */
    let settle = 0, dir = 1;
    const steer = (to, snap = false) => {
      if (page() !== 'top' || traveling) return;
      const next = Math.min(1, Math.max(0, to));
      if (next !== want) dir = next > want ? 1 : 0;
      want = next;
      finish();
      gsap.to(reveal, { progress: want, duration: snap ? .9 : .55, ease: snap ? 'power2.inOut' : 'power2.out', overwrite: true });
      clearTimeout(settle);
      /* When scrolling pauses, finish in the direction it was going: down reveals, up returns. */
      if (!snap && want > 0 && want < 1) settle = setTimeout(() => steer(dir, true), 160);
    };
    const revealed = () => reveal.progress() > .97;
    addEventListener('wheel', e => steer(want + e.deltaY / 700), { passive: true });
    let ty = null;
    addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
    addEventListener('touchmove', e => { if (ty == null) return; const y = e.touches[0].clientY; steer(want + (ty - y) / 360); ty = y; }, { passive: true });
    addEventListener('keydown', e => {
      if (page() !== 'top' || e.target.closest('input, textarea')) return;
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); steer(1); }
      if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); steer(0); }
    });
    cue.addEventListener('click', () => steer(1));

    /* The name, letter by letter: each letter has its own cursor, which drags a box around it; the
       letter wipes in and glitches into place, the box goes, and the cursor leaves. The name is
       scaled and centred by a transform, so boxes are measured from where letters really appear. */
    const nameLink = $('.hero-name a');
    const letters = SplitText.create(nameLink, { type: 'chars' }).chars;
    const onScreen = (e, sheet) => { const r = e.getBoundingClientRect(), s = sheet.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
    const intro = gsap.timeline({ paused: true });
    const crewOrder = ['copy', 'layout', 'data', 'light'];
    const crew = letters.map((ch, i) => {
      const role = crewOrder[i % crewOrder.length], cur = cursor(hero, role);
      const home = () => ({ x: i % 2 ? innerWidth + 40 : -150, y: innerHeight * (.18 + .16 * i) });
      gsap.set(cur, { autoAlpha: 0, x: home().x, y: home().y });
      intro.set(cur, { autoAlpha: 1 }, 0);
      const end = drawBox(intro, hero, cur, [ch], .1 + i * .34, role, false, onScreen);
      intro.to(cur, { x: () => home().x, y: () => home().y, duration: .5, ease: 'power2.in' }, end)
        .set(cur, { autoAlpha: 0 }, end + .5);
      return cur;
    });
    /* The cue's contents arrive with the name; the cue itself belongs to the reveal, which fades it. */
    intro.fromTo(cue.children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .6, ease: 'power2.out', stagger: .08 }, '-=.4');
    intro.timeScale(1.25);
    const finish = () => { if (intro.progress() < 1) intro.progress(1); };
    /* Start once the font is in, since the letters' boxes depend on it. */
    let started = false;
    const start = () => { if (started) return; started = true; recentre(); ScrollTrigger.refresh(); intro.play(); };
    Promise.all([document.fonts?.load('700 40px "Name"'), document.fonts?.ready]).then(start, start);
    setTimeout(start, 1500);

    const pages = {};
    let traveling = false;

    /* Hit-testing uses light.js's curve, so a click lands on the light the visitor sees. Home only. */
    const hit = (cx, cy) => {
      const [ux, uy] = f.toWorld(...f.toUV(cx, cy));
      let best = -1, dist = .028;
      LIGHTS.forEach((_, i) => {
        const d = Math.abs(f.curveY(i, ux) - uy);
        if (d < dist) { dist = d; best = i; }
      });
      return best;
    };

    /* Every project page: its build, a reset, and a quick right-click teardown for leaving. */
    const DEMOS = { remitly: '.service', emg: '.score', sentry: '.service', sloth: null, symphony: '.heat', school: '.timeline', skills: '.tui', close: '.contact' };
    const EXTRA = {
      symphony: (tl, t) => tl.from('#heat i', { scale: 0, duration: .7, ease: 'expo.out', stagger: { grid: [7, 24], from: 'center', amount: .6 } }, t),
      school: (tl, t) => tl.from('#gantt .span', { scaleX: 0, transformOrigin: '0 50%', duration: .6, ease: 'expo.out', stagger: .07 }, t),
    };
    Object.entries(DEMOS).forEach(([id, demo]) => {
      const sheet = document.getElementById(id).nextElementSibling, head = $('.head', sheet);
      const lede = $(':scope > p', head), extras = [...head.children].filter(e => e.tagName !== 'H2' && e !== lede);
      const plan = { copy: [[$('h2', head)]], layout: [[lede], ...(extras.length ? [extras] : [])], data: demo ? [[$(demo, sheet)]] : [] };
      const parts = Object.values(plan).flat(2).filter(Boolean);
      /* Built the first time the page is visible, because hidden elements measure as nothing, and
         rebuilt if the window has changed size since. */
      let b = null, size = '', down = null;
      const make = () => {
        const now = innerWidth + 'x' + innerHeight;
        if (b && size === now) return;
        if (b) { b.tl.kill(); $$('.agent, .marquee', sheet).forEach(e => e.remove()); gsap.set(parts, { clearProps: 'clipPath,transform,opacity,scale,scaleX,scaleY,x,textShadow' }); }
        b = build({ sheet, extra: EXTRA[id], plan, scrollTrigger: null });
        b.tl.timeScale(1.7);
        size = now;
      };
      const reset = () => {
        if (down) { down.kill(); down.menus.forEach(m => m.remove()); down = null; }
        if (!b) return;
        gsap.set(parts, { clearProps: 'scale,scaleX,scaleY,opacity,transform' });
        $$('.ascii-in', sheet).forEach(e => e.remove());
        b.tl.pause(0);
      };
      pages[id] = {
        prime: () => { make(); reset(); },
        enter: () => { make(); reset(); b.tl.play(0); },
        /* Leaving: the cursors delete the page, fast. Resolves when it is gone. */
        leave: () => new Promise(done => {
          if (!b) return done();
          b.tl.pause();
          down = teardown(b, sheet, () => { const d = down; down = null; d?.menus.forEach(m => m.remove()); done(); });
          down.timeScale(2.6);
        }),
        reset,
      };
    });

    /* Travel. One camera, never cut: leave the page, pull back to the field if zoomed in, then dive
       into the chosen light until it fills the screen, switch pages behind it, and ease back out to
       a close-up of that single beam while the cursors build the page around it. */
    const heroUI = ['.hero-name'];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function travel(id, cx, cy, push = true) {
      if (traveling || id === page()) return;
      traveling = true;
      root.dataset.traveling = '1';
      finish();
      const st = f?.state, from = page(), i = lightOf(id);
      gsap.to(bar, { autoAlpha: 0, duration: .25 });
      /* From the name-only screen, finish the reveal first so there is light to dive into. */
      if (from === 'top' && reveal.progress() < .99) await gsap.to(reveal, { progress: 1, duration: .5, ease: 'power2.out', overwrite: true });
      if (from === 'top') gsap.to(heroUI, { autoAlpha: 0, duration: .3 });
      if (pages[from]) await Promise.race([pages[from].leave(), sleep(700)]);
      const fromSheet = $$('.sheet').find(s => !s.hidden);
      if (from !== 'top') await gsap.to(fromSheet, { autoAlpha: 0, duration: .22 });

      /* Zoomed into a page: pull back out to the whole field, keeping the camera continuous. */
      if (st && (st.zoom > 1.01 || st.dim > .01)) {
        st.track = -1;
        await gsap.to(st, { zoom: 1, dim: 0, ax: st.fx, ay: st.fy + LIFT, speed: 1, duration: .9, ease: 'power2.inOut' });
        Object.assign(st, { solo: -1, fx: 0, fy: 0, ax: 0, ay: LIFT });
      }

      /* The new page is shown invisible first, so it can be measured and set to its unbuilt state
         before anyone sees it; then it is revealed with nothing in it but the light. */
      const arrive = () => {
        const toSheet = id === 'top' ? hero : document.getElementById(id)?.nextElementSibling;
        gsap.set(toSheet, { autoAlpha: 0 });
        window.sitePages.show(id, push);
        gsap.set(fromSheet, { clearProps: 'opacity,visibility' });
        pages[from]?.reset();
        pages[id]?.prime();
        gsap.set(heroUI, { autoAlpha: 1 });
        gsap.set(toSheet, { clearProps: 'opacity,visibility' });
      };
      const done = () => { gsap.to(bar, { autoAlpha: 1, duration: .3 }); traveling = false; delete root.dataset.traveling; };

      if (!st || i < 0) {
        /* Home and Contact have no single light: the field settles to their look. */
        arrive();
        if (st) gsap.to(st, { ...lookFor(id), duration: .8, ease: 'power2.inOut' });
        if (id === 'top') { reveal.progress(1); want = 1; }
        if (id === 'top') gsap.from(heroUI, { autoAlpha: 0, duration: .5 });
        pages[id]?.enter();
        done();
        return;
      }

      /* Dive: the clicked point on the light stays put on screen while the camera magnifies it,
         drifts it to its page position, and fades every other light. */
      const color = LIGHTS[i][2], rgb = [1, 3, 5].map(k => parseInt(color.slice(k, k + 2), 16) / 255);
      /* Re-express the camera around the chosen point without moving anything on screen. */
      const wx = cx == null ? 0 : f.toWorld(...f.toUV(cx, cy))[0], wy = f.curveY(i, wx);
      const [sx, sy] = f.toScreenUV(wx, wy);
      Object.assign(st, { fx: wx, fy: wy, ax: sx, ay: sy, solo: i, hover: i, tint: rgb, track: i });
      const cam = cameraFor(id), look = lookFor(id);
      const go = gsap.timeline();
      go.to(st, { ascii: 0, duration: .4, ease: 'power2.in' }, 0)
        .to(st, { dim: 1, duration: .7, ease: 'power1.in' }, 0)
        .to(st, { warp: 1, duration: .9, ease: 'power2.in' }, 0)
        .to(st, { zoom: 60, duration: 1.25, ease: 'expo.in' }, 0)
        .to(st, { ax: cam.ax, ay: cam.ay, speed: look.speed, duration: 1.25, ease: 'power2.inOut' }, 0)
        .call(arrive, null, 1.28)
        .to(st, { zoom: cam.zoom, duration: 1.2, ease: 'expo.out' }, 1.28)
        .call(() => { st.hover = -1; }, null, 1.28)
        .to(st, { warp: 0, power: look.power, duration: .8, ease: 'power2.out' }, 1.28)
        .call(() => pages[id]?.enter(), null, 1.45)
        .call(done, null, 2.3);
    }
    document.addEventListener('page:go', e => {
      e.preventDefault();
      const [cx, cy] = e.detail.origin || [];
      travel(e.detail.id, cx, cy, e.detail.push);
    });

    /* Pointer, home only: the lights lean toward it; hovering a light highlights it; clicking travels. */
    if (f) {
      const x = gsap.quickTo(f.state, 'mx', { duration: .9, ease: 'power3' });
      const y = gsap.quickTo(f.state, 'my', { duration: .9, ease: 'power3' });
      const home = () => page() === 'top' && !traveling && revealed();
      const overContent = e => e.target.closest('a, button, input, .nav, .legend, .hero-copy, .bar, .menu');
      addEventListener('pointermove', e => {
        if (!home()) return;
        const [ux, uy] = f.toWorld(...f.toUV(e.clientX, e.clientY));
        x(ux); y(uy);
        if (e.target.closest('.callout')) return;
        const i = overContent(e) ? -1 : hit(e.clientX, e.clientY);
        f.state.hover = i;
        document.body.style.cursor = i >= 0 ? 'pointer' : '';
      }, { passive: true });
      addEventListener('click', e => {
        if (!home() || overContent(e)) return;
        const i = hit(e.clientX, e.clientY);
        if (i >= 0) { document.body.style.cursor = ''; window.sitePages.go(LIGHTS[i][0], true, [e.clientX, e.clientY]); }
      });
    }

    /* Arriving on a deep link: no intro, and the camera starts on that page's light. */
    if (page() !== 'top') {
      intro.progress(1);
      reveal.progress(1); want = 1;
      const s0 = document.getElementById(page())?.nextElementSibling;
      gsap.set(s0, { autoAlpha: 0 }); pages[page()]?.prime(); gsap.set(s0, { clearProps: 'opacity,visibility' });
      if (f) {
        Object.assign(f.state, lookFor(page()), cameraFor(page()), { power: 0 });
        gsap.to(f.state, { power: lookFor(page()).power, duration: .6 });
      }
      pages[page()]?.enter();
    }

    /* Now and then the headline glitches, only while home is showing. */
    const burst = () => { const g = gsap.timeline(); glitch(g, [$('.hero-name a')], 0, .045); };
    gsap.timeline({ repeat: -1, delay: 6, repeatDelay: 6.5 }).call(() => { if (page() === 'top' && !traveling) burst(); });

    /* State changes keep their own feedback. */
    const scoreStrike = () => gsap.fromTo('.big', { opacity: .3 }, { keyframes: [{ opacity: 1, duration: .05 }, { opacity: .5, duration: .08 }, { opacity: 1, duration: .14 }], ease: 'none', overwrite: true });
    const swapService = () => {
      const s = SplitText.create('#svcName', { type: 'chars' });
      gsap.from(s.chars, { opacity: 0, yPercent: 26, duration: .34, ease: 'expo.out', stagger: .024, onComplete: () => s.revert() });
    };
    document.addEventListener('demo:score', scoreStrike);
    document.addEventListener('demo:service', swapService);
    addEventListener('load', () => ScrollTrigger.refresh());
    return () => {
      document.removeEventListener('demo:score', scoreStrike);
      document.removeEventListener('demo:service', swapService);
    };
  });
})();
