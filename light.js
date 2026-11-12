/* The light: seven filaments, one per project, drawn in a WebGL fragment shader. It runs its own
   render loop and depends on nothing else, so the lights render even if the motion layer fails.
   The motion layer reads and tweens window.light.state. */
(() => {
  /* The light. Seven filaments, one per project. Travel zooms into one of them: uFocus and uZoom
     magnify the field around the clicked point, uSolo fades the others, uWarp adds star streaks. */
  const FRAG = `precision highp float;
    uniform vec2 uRes, uMouse, uFocus, uAnchor; uniform float uTime, uPower, uCell, uZoom, uWarp, uAscii, uHover, uSolo, uDim;
    uniform vec3 uTint;
    uniform sampler2D uGlyphs;
    const int N = 7;
    vec3 hue(int i) {
      if (i == 0) return vec3(1., .70, .0);
      if (i == 1) return vec3(.18, 1., .62);
      if (i == 2) return vec3(1., .30, .49);
      if (i == 3) return vec3(.72, .78, 1.);
      if (i == 4) return vec3(.13, .90, 1.);
      if (i == 5) return vec3(.51, .56, 1.);
      return vec3(.78, 1., .18);
    }
    vec3 light(vec2 frag) {
      vec2 uv = (frag - .5 * uRes) / uRes.y;
      uv = uFocus + (uv - uAnchor) / uZoom;
      float aspect = uRes.x / uRes.y;
      vec3 col = vec3(0.);
      for (int i = 0; i < N; i++) {
        float f = float(i), k = (f - 3.) / 3.;
        float t = uTime * (.16 + f * .018) + f * 1.7;
        float x = uv.x * (1.5 + f * .1);
        float y = k * .11
          + .15 * sin(x * 1.3 + t) + .07 * sin(x * 2.9 - t * 1.4 + f) + .025 * sin(x * 6.1 + t * 2.1);
        float pull = exp(-pow(uv.x - uMouse.x, 2.) * 9.);
        y = mix(y, uMouse.y, pull * .55);
        float pulse = .7 + .3 * sin(uv.x * 7. - uTime * 2.2 + f * 2.);
        float d = abs(uv.y - y);
        float flash = max(0., 1. - abs(fract(uTime * .08 + f * .143) * 3.4 - 1.2 - uv.x / aspect) * 7.);
        bool hovered = uHover > -.5 && abs(f - uHover) < .5;
        bool chosen = uSolo > -.5 && abs(f - uSolo) < .5;
        float w = uHover < -.5 ? 1. : (hovered ? 1.9 : .45);
        if (!chosen && !hovered) w *= 1. - uDim;
        if (uSolo > -.5 && !chosen) w *= 1. - uWarp;
        col += hue(i) * w * ((.0011 / (d + .0009)) * pulse + (.018 / (d * 22. + 1.)) * .32) * (1. + flash * 2.4);
      }
      return 1. - exp(-col * .8 * uPower * 1.5);
    }
    float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }
    void main() {
      vec2 fc = gl_FragCoord.xy;
      vec2 uv = (fc - .5 * uRes) / uRes.y;
      vec3 smooth_ = light(fc);
      /* ASCII: every cell takes the light at its centre and picks a glyph by brightness. */
      vec3 col = smooth_;
      if (uAscii > .001) {
        vec2 cell = vec2(uCell, uCell * 1.7);
        vec3 a = light((floor(fc / cell) + .5) * cell);
        float l = max(a.r, max(a.g, a.b));
        float idx = floor(clamp(pow(l, .8) * 1.1, 0., .999) * 10.);
        vec2 in_ = fract(fc / cell);
        float glyph = texture2D(uGlyphs, vec2((idx + in_.x) / 10., 1. - in_.y)).r;
        vec3 ascii = a / max(l, .001) * glyph * (.35 + .9 * l);
        /* Around the pointer the characters dissolve into the light they stand for. */
        vec2 wv = uFocus + (uv - uAnchor) / uZoom;
        float lens = smoothstep(.2, .09, distance(wv, uMouse));
        col = mix(smooth_, ascii, uAscii * (1. - lens));
      }
      /* Warp: streaks of the chosen light rush outward from the focus. */
      if (uWarp > .001) {
        vec2 q = uv - uAnchor;
        float r = length(q), ang = atan(q.y, q.x) / 6.2832 + .5;
        float bin = floor(ang * 180.), h = hash(bin);
        float phase = fract(h * 7.3 + uTime * (.35 + h) * (1. + 5. * uWarp));
        float head = phase * phase * 1.6;
        float tail = .02 + .5 * uWarp * uWarp;
        float along = smoothstep(tail, 0., head - r) * step(r, head);
        float across = smoothstep(.5, .1, abs(fract(ang * 180.) - .5));
        float streak = along * across * step(.55, h) * smoothstep(.0, .12, r);
        col += mix(uTint, vec3(1.), .35) * streak * uWarp * 1.6;
      }
      gl_FragColor = vec4(col, 1.);
    }`;

  /* A glyph atlas: the ramp three.js's AsciiEffect uses, drawn once into a texture. */
  const RAMP = ' .:-=+*#%@';
  function glyphAtlas(gl) {
    const c = document.createElement('canvas'), w = 32, h = 54;
    c.width = w * RAMP.length; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, h);
    x.fillStyle = '#fff'; x.font = `600 ${h * .8}px ui-monospace, Menlo, monospace`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    [...RAMP].forEach((ch, i) => x.fillText(ch, i * w + w / 2, h * .54));
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, c);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }

  function field() {
    const canvas = document.getElementById('field');
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.bindAttribLocation(prog, 0, 'p');
    gl.vertexAttribPointer(gl.getAttribLocation(prog, 'p'), 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(prog, n);
    const uni = { anchor: u('uAnchor'), res: u('uRes'), time: u('uTime'), power: u('uPower'), mouse: u('uMouse'), cell: u('uCell'),
      focus: u('uFocus'), zoom: u('uZoom'), warp: u('uWarp'), ascii: u('uAscii'), hover: u('uHover'), solo: u('uSolo'), tint: u('uTint'), dim: u('uDim') };
    glyphAtlas(gl);
    gl.uniform1i(u('uGlyphs'), 0);
    const state = { power: 0, time: 40, mx: 9, my: 0, fx: 0, fy: 0, ax: 0, ay: .1, zoom: 1, warp: 0, ascii: 0, hover: -1, solo: -1, dim: 0, track: -1, speed: 1, tint: [1, 1, 1] };
    const resize = () => {
      const scale = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = canvas.clientWidth * scale; canvas.height = canvas.clientHeight * scale;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uni.res, canvas.width, canvas.height);
      gl.uniform1f(uni.cell, Math.round(9 * scale));
      draw();
    };
    const draw = () => {
      gl.uniform1f(uni.time, state.time);
      gl.uniform1f(uni.power, state.power);
      gl.uniform2f(uni.mouse, state.mx, state.my);
      gl.uniform2f(uni.focus, state.fx, state.fy);
      gl.uniform2f(uni.anchor, state.ax, state.ay);
      gl.uniform1f(uni.zoom, state.zoom);
      gl.uniform1f(uni.warp, state.warp);
      gl.uniform1f(uni.ascii, state.ascii);
      gl.uniform1f(uni.hover, state.hover);
      gl.uniform1f(uni.solo, state.solo);
      gl.uniform1f(uni.dim, state.dim);
      gl.uniform3f(uni.tint, ...state.tint);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    addEventListener('resize', resize);
    resize();
    return { state, draw, canvas };
  }

  const f = field();
  if (!f) return;
  /* The same curve the shader draws, in world units, so JS can hit-test, label, and track a light. */
  f.curveY = (i, ux, st = f.state) => {
    const t = st.time * (.16 + i * .018) + i * 1.7, x = ux * (1.5 + i * .1), k = (i - 3) / 3;
    const y = k * .11 + .15 * Math.sin(x * 1.3 + t) + .07 * Math.sin(x * 2.9 - t * 1.4 + i) + .025 * Math.sin(x * 6.1 + t * 2.1);
    const pull = Math.exp(-((ux - st.mx) ** 2) * 9);
    return y + (st.my - y) * pull * .55;
  };
  /* World and screen, both in units of screen height from the centre. At zoom 1 with anchor on
     focus they are the same; the camera can magnify a world point and hold it anywhere on screen. */
  f.toWorld = (sx, sy) => [f.state.fx + (sx - f.state.ax) / f.state.zoom, f.state.fy + (sy - f.state.ay) / f.state.zoom];
  f.toScreenPx = (wx, wy) => {
    const s = f.state, sx = s.ax + (wx - s.fx) * s.zoom, sy = s.ay + (wy - s.fy) * s.zoom;
    return [innerWidth / 2 + sx * innerHeight, innerHeight / 2 - sy * innerHeight];
  };
  f.toScreenUV = (wx, wy) => { const s = f.state; return [s.ax + (wx - s.fx) * s.zoom, s.ay + (wy - s.fy) * s.zoom]; };
  f.toUV = (cx, cy) => [(cx - innerWidth / 2) / innerHeight, (innerHeight / 2 - cy) / innerHeight];
  window.light = f;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  /* The intro strikes the lights on. If no intro claims them shortly, they simply come on. */
  if (document.documentElement.classList.contains('pre')) {
    setTimeout(() => { if (!f.state.claimed) f.state.power = 1; }, 1200);
  } else f.state.power = 1;
  /* Callouts. Each light has a label tied to a point on its beam by a leader with one elbow: up or
     down from the beam, then across to the label. Labels ride with their beams, and each picks a
     place (above or below, at one of a few leader lengths) that clears the other labels and the
     page's own text. A label keeps its place while it stays clear, so nothing jumps around. */
  const NS = 'http://www.w3.org/2000/svg';
  const LABELS = [
    ['remitly', 'Remitly', '$30k a year', '#ffb300', .13], ['school', 'Education', 'UCSD 2028', '#2dff9e', .29],
    ['emg', 'sEMG paper', 'IEEE BioCAS', '#ff4d7d', .45], ['skills', 'Skills', '8 languages', '#b7c8ff', .6],
    ['symphony', 'Symphony', '$2k seed', '#22e6ff', .74], ['sentry', 'Smart Sentry', '150 meetings', '#8390ff', .87],
    ['sloth', 'SlothLab', '95.0% F1', '#c6ff2e', .37],
  ];
  const LENS = [54, 92, 130, 172];
  /* Where along its beam a label may anchor, as offsets from its home position across the screen. */
  const SLIDE = [0, .05, -.05, .1, -.1, .16, -.16, .24, .32, .4, .5, .6];
  const hero = document.querySelector('.hero');
  const layer = document.createElement('div');
  layer.className = 'callouts';
  layer.innerHTML = '<svg class="leaders" aria-hidden="true"></svg>';
  hero.append(layer);
  const svg = layer.querySelector('svg');
  const items = LABELS.map(([id, name, fig, color, fx], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'callout';
    b.style.setProperty('--c', color);
    b.innerHTML = `<b>${name}</b><span>${fig}</span>`;
    const path = document.createElementNS(NS, 'path'), dot = document.createElementNS(NS, 'circle');
    path.setAttribute('stroke', color); dot.setAttribute('fill', color); dot.setAttribute('r', '3.5');
    svg.append(path, dot);
    layer.append(b);
    const it = { i, id, b, path, dot, fx, slide: 0, side: i % 2 ? 1 : -1, len: 1, ly: null, lx: null, vx: 0, vy: 0, ax: 0, ay: 0, w: 0, h: 0, bad: 0, right: true };
    b.addEventListener('click', () => window.sitePages?.go(id, true, [it.ax, it.ay]));
    b.addEventListener('pointerenter', () => { f.state.hover = i; });
    b.addEventListener('pointerleave', () => { if (f.state.hover === i) f.state.hover = -1; });
    return it;
  });
  const blockers = () => ['.hero-name', '.scroll-cue']
    .map(q => document.querySelector(q)?.getBoundingClientRect()).filter(r => r && r.width);
  const hits = (a, b, pad = 6) => a.l < b.right + pad && a.r > b.left - pad && a.t < b.bottom + pad && a.b > b.top - pad;
  /* A label sits off to one side of its anchor, so the leader runs as a diagonal to a short
     horizontal shoulder and into the label. */
  const SHOULDER = 16;
  const box = (it, side, len) => {
    const dx = len * .5, y = it.ay + side * len;
    const right = it.ax + dx + SHOULDER + it.w < innerWidth - 10;
    const l = right ? it.ax + dx + SHOULDER : it.ax - dx - SHOULDER - it.w;
    return { l, r: l + it.w, t: y - it.h / 2, b: y + it.h / 2, y, right, cx: l + it.w / 2 };
  };
  f.frame = () => {
    const show = (document.documentElement.dataset.page || 'top') === 'top' && f.state.zoom < 1.02 && f.state.power > .8 && !document.documentElement.dataset.traveling;
    layer.classList.toggle('on', show);
    if (!show) return;
    /* Reads first. */
    const walls = blockers();
    for (const it of items) if (!it.w) { it.w = it.b.offsetWidth; it.h = it.b.offsetHeight; }
    /* Labels are placed from where each beam rests without the pointer's pull, so they float with
       the light's own slow drift and ignore the cursor. The dot rides the real, bent beam and the
       diagonal leader flexes to reach it. */
    const rest = { ...f.state, mx: 9, my: 0 };
    const worldX = (it, k) => f.toWorld((Math.min(.95, Math.max(.05, it.fx + SLIDE[k])) * innerWidth - innerWidth / 2) / innerHeight, 0)[0];
    const anchorAt = (it, k) => { const ux = worldX(it, k); return f.toScreenPx(ux, f.curveY(it.i, ux, rest)); };
    const dotAt = (it, k) => { const ux = worldX(it, k); return f.toScreenPx(ux, f.curveY(it.i, ux)); };
    const inside = ([x, y]) => walls.some(w => x > w.left - 8 && x < w.right + 8 && y > w.top - 8 && y < w.bottom + 8);
    /* Then placement. A label keeps its place while that place is roughly clear (touching is
       tolerated). Only after it has been properly blocked for a moment does it move, and then to the
       clear place nearest where it already is, so labels settle instead of hopping. */
    const now = performance.now();
    const placed = [];
    /* Labels may never touch each other, where they are now or where they are heading. Text blocks
       get a little tolerance, so a label grazing the headline's edge does not have to move. */
    const now_ = items.map(it => it.lx == null || it.out ? null : { left: it.lx, right: it.lx + it.w, top: it.ly - it.h / 2, bottom: it.ly + it.h / 2 });
    const blocked = (r, pad, self) => r.t < 8 || r.b > innerHeight - 8 || r.l < 6 || r.r > innerWidth - 6
      || walls.some(w => hits(r, w, pad))
      || placed.some(p => p && hits(r, { left: p.l, right: p.r, top: p.t, bottom: p.b }, 4))
      || now_.some((c, j) => c && j !== self && j < placed.length && hits(r, c, 2));
    for (const it of items) {
      const a0 = anchorAt(it, it.slide);
      [it.ax, it.ay] = a0;
      let r = box(it, it.side, LENS[it.len]);
      const ok = !it.out && !inside(a0) && !blocked(r, -4, it.i);
      if (ok) it.bad = 0;
      else if (!it.bad) it.bad = now;
      if (!ok && (it.out || now - it.bad > 220)) {
        /* Search every place along the beam; keep the one that moves the label least. */
        let best = null, score = Infinity;
        const cx = it.lx == null ? r.cx : it.lx + it.w / 2, cy = it.ly == null ? r.y : it.ly;
        for (const k of SLIDE.keys()) {
          const a = anchorAt(it, k);
          if (inside(a)) continue;
          [it.ax, it.ay] = a;
          for (const sd of [1, -1]) for (const n of LENS.keys()) {
            const c = box(it, sd, LENS[n]);
            if (blocked(c, 6, it.i)) continue;
            const d = Math.hypot(c.cx - cx, c.y - cy) + n * 6;
            if (d < score) { score = d; best = [k, sd, n, c, a]; }
          }
        }
        if (best) { [it.slide, it.side, it.len, r] = best; [it.ax, it.ay] = best[4]; it.out = false; it.bad = 0; }
        else it.out = true;
      }
      placed.push(it.out ? null : r);
    }
    /* Writes: labels move on a gentle spring, so even a needed move reads as a drift. The leader runs
       from the beam on a diagonal to a short shoulder, then into the label. */
    items.forEach((it, n) => {
      const r = placed[n];
      it.b.classList.toggle('out', !!it.out);
      it.path.style.opacity = it.dot.style.opacity = it.out ? 0 : '';
      if (!r) return;
      if (it.lx == null) { it.lx = r.l; it.ly = r.y; }
      it.vx = (it.vx + (r.l - it.lx) * .09) * .72; it.vy = (it.vy + (r.y - it.ly) * .09) * .72;
      const sp = Math.hypot(it.vx, it.vy), cap = 9;
      if (sp > cap) { it.vx *= cap / sp; it.vy *= cap / sp; }
      it.lx += it.vx; it.ly += it.vy;
      [it.ax, it.ay] = dotAt(it, it.slide);
      it.right = r.right;
      it.b.style.transform = `translate(${it.lx.toFixed(1)}px, ${(it.ly - it.h / 2).toFixed(1)}px)`;
      const edge = r.right ? it.lx : it.lx + it.w, ex = r.right ? edge - SHOULDER : edge + SHOULDER;
      it.path.setAttribute('d', `M${it.ax.toFixed(1)} ${it.ay.toFixed(1)} L${ex.toFixed(1)} ${it.ly.toFixed(1)} H${edge.toFixed(1)}`);
      it.dot.setAttribute('cx', it.ax.toFixed(1)); it.dot.setAttribute('cy', it.ay.toFixed(1));
    });
  };

  /* Label sizes depend on the font, so measure again once it is in. */
  document.fonts?.ready.then(() => items.forEach(it => { it.w = 0; }));

  let last = performance.now();
  const loop = now => {
    const dt = Math.min(now - last, 100);
    last = now;
    /* Still under reduced motion: a few redraws a second keep it in step with page changes. */
    if (!document.hidden && (!reduced.matches || now - (f.lastDraw || 0) > 250)) {
      if (!reduced.matches) f.state.time += dt / 1000 * f.state.speed;
      /* Tracking: the camera follows a light, so the beam keeps passing through its anchor point. */
      if (f.state.track >= 0) f.state.fy = f.curveY(f.state.track, f.state.fx);
      f.frame?.(now);
      f.draw();
      f.lastDraw = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
