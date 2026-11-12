/* Two 3D scenes in raw WebGL2, with no library. Every line is a camera-facing ribbon with
   a light falloff in its fragment shader, so depth and glow come from the same pass.
   Scenes start only when near the screen and draw only while actually visible. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  const VERT = pos => `#version 300 es
    precision highp float;
    in vec2 aCorner; in vec3 aA; in vec3 aB;
    uniform vec2 uRes; uniform float uWidth, uTime, uMix, uScale, uFocal, uDist;
    uniform mat3 uView, uModel; uniform vec3 uShift;
    out vec2 vD; out float vLen, vH, vFade;
    ${pos}
    vec4 project(vec3 p) {
      vec3 c = uView * p; c.z -= uDist;
      return vec4(c.x * uFocal * uRes.y / uRes.x, c.y * uFocal, c.z * .01, -c.z);
    }
    void main() {
      float ha, hb;
      vec3 a = place(aA, ha), b = place(aB, hb);
      vec4 pa = project(a), pb = project(b);
      vec2 sa = pa.xy / pa.w * uRes * .5, sb = pb.xy / pb.w * uRes * .5;
      vec2 d = sb - sa; float len = max(length(d), .001); d /= len;
      vec2 n = vec2(-d.y, d.x);
      float end = aCorner.y * .5 + .5;
      vec4 base = mix(pa, pb, end);
      vec2 s = mix(sa, sb, end) + n * aCorner.x * uWidth + d * aCorner.y * uWidth;
      gl_Position = vec4(s / uRes * 2. * base.w, 0., base.w);
      vD = vec2(aCorner.x * uWidth, mix(-uWidth, len + uWidth, end));
      vLen = len; vH = mix(ha, hb, end);
      vFade = clamp(1.25 - base.w / (uDist * 1.32), .12, 1.);
    }`;

  const FRAG = `#version 300 es
    precision highp float;
    in vec2 vD; in float vLen, vH, vFade;
    uniform vec3 uColor; uniform float uPower, uCore;
    out vec4 o;
    void main() {
      float along = max(max(-vD.y, vD.y - vLen), 0.);
      float d = length(vec2(vD.x, along));
      float g = .34 / (d * d * .05 + .16) * .05 + exp(-d * .26) * .14;
      float core = smoothstep(uCore + 1., uCore - .3, d);
      vec3 c = mix(uColor, vec3(1.), .62 * vH) * g + mix(uColor, vec3(1.), .5 + .4 * vH) * core;
      c *= vFade * uPower;
      o = vec4(c, max(c.r, max(c.g, c.b)));
    }`;

  /* The same smooth surface, snapped to 8 or 16 levels. The toggle sweeps across it. */
  const WAVE = `
    float wave(vec2 p) {
      float t = uTime * .22;
      float h = sin(p.x * 1.5 + t) * .3 + sin(p.y * 1.9 - t * .7) * .24
        + sin((p.x + p.y) * 1.1 + t * .6) * .22 + sin(length(p * 1.3) * 2.2 - t) * .18;
      return clamp(h * .78 + .5, 0., .999);
    }
    /* One ridge per user, learned back to front. With replay every ridge keeps its shape; with EWC
       the earlier users flatten, which is forgetting. uMix runs 0 (replay) to 1 (EWC). */
    vec3 place(vec3 s, out float h) {
      float raw = wave(vec2(s.z, s.y));
      float age = 1. - (s.y + 1.7) / 3.4;
      float keep = 1. - uMix * age * .85;
      h = .5 + (raw - .5) * keep;
      return vec3(s.x, h * 1.5 - .75, s.y);
    }`;
  const SOLID = `
    vec3 place(vec3 s, out float h) { h = .5; return uModel * s * uScale + uShift; }`;

  function context(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) return null;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    return gl;
  }
  function program(gl, pos) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT(pos)], [gl.FRAGMENT_SHADER, FRAG]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    }
    gl.linkProgram(p); gl.useProgram(p);
    const cache = {};
    p.u = n => cache[n] ?? (cache[n] = gl.getUniformLocation(p, n));
    return p;
  }
  function segments(gl, p, data) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const corners = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const c = gl.getAttribLocation(p, 'aCorner'); gl.enableVertexAttribArray(c); gl.vertexAttribPointer(c, 2, gl.FLOAT, false, 0, 0);
    const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    for (const [name, off] of [['aA', 0], ['aB', 12]]) {
      const l = gl.getAttribLocation(p, name);
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 24, off); gl.vertexAttribDivisor(l, 1);
    }
    return { vao, count: data.length / 6 };
  }
  const viewMatrix = (yaw, pitch) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return new Float32Array([cy, sy * sp, -sy * cp, 0, cp, sp, sy, -cy * sp, cy * cp]);
  };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

  /* sEMG paper: ridgelines of a surface, one per user, each drawn as sampled steps. aA and aB carry x, the row, and the sample point. */
  function quantized(canvas, sheet) {
    const gl = context(canvas); if (!gl) return null;
    const p = program(gl, WAVE);
    const rows = 24, cols = 58, data = [];
    const X = i => -2.3 + 4.6 * i / cols, Z = j => -1.7 + 3.4 * j / (rows - 1);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = X(i), b = X(i + 1), z = Z(j), next = X(Math.min(i + 1, cols - 1));
      data.push(a, z, a, b, z, a);       // tread
      if (i < cols - 1) data.push(b, z, a, b, z, next);  // riser
    }
    /* Sample coordinates go through aA.z, so place() reads them as s.z. */
    const mesh = segments(gl, p, data);
    const scene = { mix: 0, target: 0, yaw: -.55, pitch: .52, px: 0, py: 0 };
    gl.uniform3fv(p.u('uColor'), hex(getComputedStyle(sheet).getPropertyValue('--neon').trim()));
    gl.uniform1f(p.u('uDist'), 6.2); gl.uniform1f(p.u('uCore'), .75);
    scene.draw = (time, power, swoop, res) => {
      scene.mix = reduced.matches ? scene.target : scene.mix + (scene.target - scene.mix) * .055;
      gl.useProgram(p); gl.bindVertexArray(mesh.vao);
      gl.uniform2f(p.u('uRes'), ...res);
      gl.uniform1f(p.u('uTime'), time); gl.uniform1f(p.u('uMix'), scene.mix);
      gl.uniform1f(p.u('uPower'), power); gl.uniform1f(p.u('uWidth'), 7 * (res[1] / 620 + .3));
      gl.uniform1f(p.u('uFocal'), 2.15);
      gl.uniformMatrix3fv(p.u('uView'), false, viewMatrix(scene.yaw + scene.px * .3 + swoop * -.5, scene.pitch + scene.py * .14 + swoop * .55));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, mesh.count);
    };
    return scene;
  }

  /* Smart Sentry: the four pipeline stages as solids on one orbit. */
  function orbit(canvas, sheet) {
    const gl = context(canvas); if (!gl) return null;
    const p = program(gl, SOLID);
    const g = (1 + Math.sqrt(5)) / 2;
    const signs = [1, -1];
    const verts = {
      ico: signs.flatMap(a => signs.flatMap(b => [[0, a, b * g], [a, b * g, 0], [b * g, 0, a]])),
      cube: signs.flatMap(a => signs.flatMap(b => signs.map(c => [a, b, c]))),
      octa: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
      tetra: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    };
    const edges = list => {
      const r = Math.hypot(...list[0]), n = list.map(v => v.map(x => x / r)), out = [];
      let min = 9;
      n.forEach((a, i) => n.forEach((b, j) => { if (j > i) min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }));
      n.forEach((a, i) => n.forEach((b, j) => { if (j > i && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < min * 1.05) out.push(...a, ...b); }));
      return out;
    };
    /* source, segment, tag, draft */
    const solids = ['ico', 'cube', 'octa', 'tetra'].map((k, i) => ({
      mesh: segments(gl, p, edges(verts[k])), spin: .22 + i * .05, tilt: i * 1.3, scale: i ? .7 : 1.15, glow: i ? .4 : 1,
    }));
    const scene = { angle: 0, target: 0, px: 0, py: 0, picked: 0 };
    gl.uniform3fv(p.u('uColor'), hex(getComputedStyle(sheet).getPropertyValue('--neon').trim()));
    gl.uniform1f(p.u('uDist'), 7); gl.uniform1f(p.u('uFocal'), 2.5); gl.uniform1f(p.u('uCore'), 1.1);
    scene.select = i => {
      scene.picked = i;
      /* Take the short way round the orbit. */
      const step = Math.PI / 2, here = Math.round(scene.target / step);
      const delta = ((-i - here) % 4 + 6) % 4 - 2;
      scene.target = (here + delta) * step;
    };
    scene.draw = (time, power, swoop, res) => {
      const ease = reduced.matches ? 1 : .07;
      scene.angle += (scene.target - scene.angle) * ease;
      gl.useProgram(p);
      gl.uniform2f(p.u('uRes'), ...res);
      gl.uniformMatrix3fv(p.u('uView'), false, viewMatrix(scene.px * .22, .2 + scene.py * .12 + swoop * .4));
      gl.clear(gl.COLOR_BUFFER_BIT);
      solids.forEach((s, i) => {
        const on = i === scene.picked;
        s.scale += ((on ? 1.2 : .62) - s.scale) * ease;
        s.glow += ((on ? 1 : .34) - s.glow) * ease;
        const a = scene.angle + i * Math.PI / 2;
        const spin = time * s.spin * (reduced.matches ? 0 : 1) + s.tilt;
        gl.bindVertexArray(s.mesh.vao);
        gl.uniformMatrix3fv(p.u('uModel'), false, viewMatrix(spin, s.tilt * .7));
        gl.uniform3f(p.u('uShift'), Math.sin(a) * 2.3, Math.sin(time * .4 + i * 2) * .1, Math.cos(a) * 2.3 - .8);
        gl.uniform1f(p.u('uScale'), s.scale);
        gl.uniform1f(p.u('uPower'), power * s.glow);
        gl.uniform1f(p.u('uWidth'), 8 * (res[1] / 620 + .3));
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.mesh.count);
      });
    };
    return scene;
  }

  /* Runs a scene only while its sheet is near the screen and not buried under the next sheet. */
  function mount(id, build) {
    const canvas = document.getElementById(id);
    const sheet = canvas.closest('.sheet');
    const next = sheet.nextElementSibling?.nextElementSibling;
    const state = { scene: null, near: false, started: 0, raf: 0, queued: [] };
    const res = [0, 0];
    const size = () => {
      const s = Math.min(devicePixelRatio || 1, 1.5);
      res[0] = Math.round(canvas.clientWidth * s); res[1] = Math.round(canvas.clientHeight * s);
      canvas.width = res[0]; canvas.height = res[1];
    };
    const frame = now => {
      state.raf = 0;
      if (!state.near) return;
      /* Pages are shown one at a time, so a scene draws whenever its page is on screen. */
      const scene = state.scene, buried = sheet.hidden;
      if (!buried) {
        const t = (now - state.started) / 1000;
        const rise = reduced.matches ? 0 : clamp(sheet.getBoundingClientRect().top / innerHeight);
        const swoop = rise * rise;
        /* A short strike on first sight, then steady. */
        const power = reduced.matches || t > .62 ? 1 : [.75, .1, .95, .3, .6, 1][Math.floor(t / .105)];
        scene.draw(reduced.matches ? 12 : 40 + now / 1000, power, swoop, res);
      }
      if (!reduced.matches) state.raf = requestAnimationFrame(frame);
    };
    const poke = () => { if (!state.raf && state.near) state.raf = requestAnimationFrame(frame); };
    new IntersectionObserver(([e]) => {
      state.near = e.isIntersecting;
      if (state.near && !state.scene) {
        size();
        state.scene = build(canvas, sheet);
        if (!state.scene) { canvas.remove(); return; }
        gl_viewport(canvas, res);
        state.started = performance.now();
        state.queued.forEach(fn => fn(state.scene));
      }
      poke();
    }, { rootMargin: '25% 0px' }).observe(canvas);
    addEventListener('resize', () => { if (state.scene) { size(); gl_viewport(canvas, res); poke(); } });
    sheet.addEventListener('pointermove', e => {
      if (!state.scene) return;
      state.scene.px = e.clientX / innerWidth * 2 - 1;
      state.scene.py = e.clientY / innerHeight * 2 - 1;
      poke();
    });
    return fn => { if (state.scene) { fn(state.scene); poke(); } else state.queued.splice(0, 9, fn); };
  }
  const gl_viewport = (canvas, res) => canvas.getContext('webgl2').viewport(0, 0, res[0], res[1]);

  const emg = mount('depthEmg', quantized);
  const sentry = mount('depthSentry', orbit);
  document.addEventListener('demo:score', e => emg(s => { s.target = e.detail; }));
  document.addEventListener('demo:service', e => sentry(s => s.select(e.detail)));
})();
