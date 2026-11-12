(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const rng = seed => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* Remitly: two projects from one internship. */
  const REMITLY = [
    ['$30k', 'Cut annual spend by automating mentorship matching. An LLM scores the candidate pairs, and a person moderates every match.', ['Saved', '$30k a year'], ['Stack', 'Go, DynamoDB, React, Kubernetes']],
    ['~800k', 'An observational causal inference study of cross-border payments customers, estimating counterfactual churn while controlling for pre-treatment confounders.', ['Finding', 'Identity verification (KYC) and price changes were each associated with about 5 percentage points higher churn'], ['Tools', 'Trino SQL, Python']],
  ];
  const setRemitly = i => {
    const [big, what, a, b] = REMITLY[i];
    $('#rmBig').textContent = big;
    $('#rmWhat').textContent = what;
    [['#rmK1', '#rmV1', a], ['#rmK2', '#rmV2', b]].forEach(([k, v, [dt, dd]]) => { $(k).textContent = dt; $(v).textContent = dd; });
  };

  /* sEMG: forgetting under each method. EWC is a range across settings, so it shows as one. */
  const METHODS = [{ name: 'replay', lo: 1.8, hi: 1.8 }, { name: 'EWC', lo: 16, hi: 28 }];
  let scoreNow = [1.8, 1.8], scoreRaf = 0;
  const fmt = (lo, hi) => Math.abs(hi - lo) < .05 ? lo.toFixed(1) : `${Math.round(lo)}–${Math.round(hi)}`;
  const setScore = i => {
    const m = METHODS[i], from = scoreNow.slice(), t0 = performance.now();
    $('#scoreWhat').textContent = `Forgetting with ${m.name}`;
    $('#scoreBar').style.transform = `scaleX(${m.hi / 30})`;
    document.dispatchEvent(new CustomEvent('demo:score', { detail: i }));
    cancelAnimationFrame(scoreRaf);
    if (reduced.matches) { scoreNow = [m.lo, m.hi]; $('#scoreNum').textContent = fmt(m.lo, m.hi); return; }
    const tick = t => {
      const p = clamp((t - t0) / 620), e = 1 - Math.pow(1 - p, 4);
      scoreNow = [from[0] + (m.lo - from[0]) * e, from[1] + (m.hi - from[1]) * e];
      $('#scoreNum').textContent = p < 1 ? fmt(scoreNow[0], scoreNow[1]).replace(/^(\d+)–\1$/, '$1') : fmt(m.lo, m.hi);
      if (p < 1) scoreRaf = requestAnimationFrame(tick);
    };
    scoreRaf = requestAnimationFrame(tick);
  };

  /* Skills: one row per group, navigated like a terminal list. */
  const SKILLS = [
    ['Languages', 'Python, Go (Golang), TypeScript, JavaScript, C++, C, Java, SQL', 'Go and Python at Remitly.'],
    ['Frameworks', 'React, Next.js, PyTorch, Hugging Face Transformers, scikit-learn, snnTorch', 'React at Remitly and in Symphony.'],
    ['ML / AI', 'LLM APIs, AI agents, LoRA, PEFT, MCP, NLP, RAG, named entity recognition, regression, deep learning', 'LoRA and NER at SlothLab, LLM scoring at Remitly, LLM lead tooling at Smart Sentry, MCP in Symphony.'],
    ['Data / stats', 'Pandas, NumPy, Trino, causal inference, A/B testing, statistical analysis', 'Trino and causal inference in the Remitly churn study.'],
    ['Infrastructure', 'AWS, Kubernetes, Docker, DynamoDB, PostgreSQL, Supabase, Linux, REST APIs, CI/CD, Git', 'Kubernetes and DynamoDB at Remitly.'],
  ];
  const tui = $('#tui');
  const items = SKILLS.map(([k, list]) => {
    const li = document.createElement('li');
    [k, list, String(list.split(', ').length)].forEach(c => { const s = document.createElement('span'); s.textContent = c; li.append(s); });
    tui.append(li);
    return li;
  });
  let row = 0;
  const moveRow = d => {
    row = (row + d + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('on', i === row));
    $('#tuiNote').textContent = `${SKILLS[row][0]}: ${SKILLS[row][2]} Press j or k, or use the arrows below.`;
  };
  items.forEach((li, i) => li.addEventListener('click', () => moveRow(i - row)));

  /* Symphony: seven days by 24 hours of agent activity. Sample data. */
  const heat = $('#heat');
  const cells = Array.from({ length: 168 }, () => heat.appendChild(document.createElement('i')));
  const MEASURES = ['Prompts', 'Tokens', 'Model cost'];
  const setHeat = i => {
    const r = rng([17, 53, 91][i]);
    let peak = 0, peakAt = 0;
    const vals = cells.map((_, n) => {
      const h = n % 24, d = Math.floor(n / 24);
      const work = Math.exp(-((h - 15) ** 2) / 34) + Math.exp(-((h - 22) ** 2) / 8) * (.4 + i * .25);
      const v = clamp(work * (d > 4 ? .55 : 1) * (.45 + r() * .75));
      if (v > peak) { peak = v; peakAt = h; }
      return v;
    });
    cells.forEach((c, n) => c.style.setProperty('--v', (.08 + .92 * vals[n] / peak).toFixed(3)));
    $('#heatNote').textContent = `${MEASURES[i]} by hour across a team's agents, one row per day. Busiest hour: ${String(peakAt).padStart(2, '0')}:00.`;
  };

  /* Smart Sentry: the lead pipeline, one stage at a time. */
  const SERVICES = [
    ['source', 'Sourced over 10k leads.', '150 customer meetings'],
    ['segment', 'Sorted the leads into segments, so each kind of customer gets outreach written for it.', '20% higher reply rates, with tagging'],
    ['tag', 'Tagged every lead with signals like recent LinkedIn activity and whether an email is available.', 'Picks the outreach channel automatically'],
    ['draft', 'Chose the channel and drafted the message, inside the CRM workflow the team already used.', 'About 80% less manual prospecting and outreach time'],
  ];
  const setService = i => {
    const [n, w, res] = SERVICES[i];
    $('#svcName').textContent = n;
    $('#svcWhat').textContent = w;
    $('#svcRes').textContent = res;
    document.dispatchEvent(new CustomEvent('demo:service', { detail: i }));
  };

  /* SlothLab: 1,250 squares, each 0.08% of the parameters. LoRA trained 0.32%, so 4 squares. */
  const pgrid = $('#pgrid');
  const LORA = new Set([212, 538, 791, 1107]);
  for (let n = 0; n < 1250; n++) pgrid.appendChild(document.createElement('i')).className = LORA.has(n) ? 'lora' : '';
  const setParams = i => {
    pgrid.classList.toggle('full', i === 0);
    $('#paramNote').textContent = i === 0
      ? 'Full fine-tuning updates every square: all 1,250.'
      : 'LoRA trains 4 squares of 1,250: 99.68% fewer parameters, at 95.0% validation F1.';
  };

  /* Education: everything on one time axis, January 2024 to June 2028. Bars with a page are doors. */
  const T0 = 2024, T1 = 2028.5, NOW = 2026 + 10.2 / 12;
  const ym = (y, m) => y + (m - 1) / 12;
  const SPANS = [
    ['UC Santa Cruz', 'school', 2024, 2026, '2024 to 2026'],
    ['UC San Diego', 'school', 2026, ym(2028, 7), 'to June 2028'],
    ['SlothLab', 'sloth', ym(2025, 7), ym(2026, 2), 'Jul 2025 to Jan 2026'],
    ['Neuromorphic Computing Group', 'emg', ym(2025, 9), NOW, 'since Sep 2025'],
    ['Symphony', 'symphony', ym(2026, 3), NOW, 'since Mar 2026'],
    ['Smart Sentry AI', 'sentry', ym(2026, 4), ym(2026, 8), 'Apr to Jul 2026'],
    ['Remitly', 'remitly', ym(2026, 7), ym(2026, 9), 'Jul to Aug 2026'],
  ];
  const gpct = t => (t - T0) / (T1 - T0) * 100;
  const gantt = $('#gantt');
  SPANS.forEach(([name, id, a, b, when]) => {
    const li = document.createElement('li');
    const bar = document.createElement(id === 'school' ? 'span' : 'a');
    bar.className = 'span';
    if (id !== 'school') bar.href = '#' + id;
    bar.dataset.scene = id === 'school' ? 'school' : id;
    bar.style.setProperty('--s', gpct(a));
    bar.style.setProperty('--w', gpct(b) - gpct(a));
    if (b === NOW) bar.classList.add('open');
    bar.innerHTML = '<span class="lbl"><b></b> <i></i></span>';
    bar.querySelector('b').textContent = name;
    bar.querySelector('i').textContent = when;
    if (gpct(b) > 72) bar.classList.add('flip');
    li.append(bar);
    gantt.append(li);
  });
  gantt.style.setProperty('--now', gpct(NOW));

  /* Shared colour helpers: the bar picks black or white ink from each page's colours. */
  const hexRgb = h => h.trim().match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16));
  const luminance = rgb => {
    const [r, g, b] = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g + .0722 * b;
  };

  /* Controls each sheet hands to the glass bar. */
  const CONTROLS = {
    Remitly: { label: 'Project', options: ['Matching', 'Churn study'], set: setRemitly, value: 0 },
    'sEMG paper': { label: 'Method', options: ['Replay', 'EWC'], set: setScore, value: 0 },
    'Smart Sentry': { label: 'Stage', options: SERVICES.map(s => s[0]), set: setService, value: 0 },
    SlothLab: { label: 'Training', options: ['Full', 'LoRA'], set: setParams, value: 1 },
    Symphony: { label: 'Measure', options: ['Prompts', 'Tokens', 'Cost'], set: setHeat, value: 0 },
    Skills: { keys: true },
  };
  Object.values(CONTROLS).forEach(c => c.set && c.set(c.value));
  moveRow(0);

  const ctl = $('#ctl'), bar = $('#bar');

  const placeThumb = seg => {
    const on = $('[aria-pressed="true"]', seg);
    if (!on) return;
    seg.style.setProperty('--tx', on.offsetLeft + 'px');
    seg.style.setProperty('--tw', on.offsetWidth + 'px');
  };
  const iconBtn = (path, label, fn) => {
    const b = document.createElement('button');
    b.className = 'pill icon';
    b.setAttribute('aria-label', label);
    b.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${path}"/></svg>`;
    b.addEventListener('click', fn);
    return b;
  };
  const renderControls = c => {
    ctl.replaceChildren();
    if (!c) return;
    if (c.keys) {
      const w = document.createElement('div');
      w.className = 'keys';
      w.append(iconBtn('M5 12l5-5 5 5', 'Previous row', () => moveRow(-1)), iconBtn('M5 8l5 5 5-5', 'Next row', () => moveRow(1)));
      ctl.append(w);
      return;
    }
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', c.label);
    const thumb = document.createElement('i');
    thumb.className = 'thumb';
    seg.append(thumb);
    c.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = o;
      b.setAttribute('aria-pressed', i === c.value);
      b.addEventListener('click', () => {
        c.value = i;
        $$('button', seg).forEach((x, j) => x.setAttribute('aria-pressed', j === i));
        placeThumb(seg);
        c.set(i);
      });
      seg.append(b);
    });
    ctl.append(seg);
    placeThumb(seg);
  };

  /* Refraction. Chromium accepts an SVG filter in backdrop-filter, others keep the blur. */
  const isChromium = !!navigator.userAgentData?.brands?.some(b => b.brand === 'Chromium');
  const lensMap = $('#lensMap'), lens = $('#lens');
  const canvas = document.createElement('canvas');
  const drawLens = (w, h) => {
    if (!isChromium || !w) return;
    w = Math.round(w); h = Math.round(h);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const rad = h / 2, rim = 16;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cx = clamp(x + .5, rad, w - rad), dx = x + .5 - cx, dy = y + .5 - rad;
      const len = Math.hypot(dx, dy) || 1;
      const depth = clamp((rad - len) / rim);
      const m = (1 - depth) ** 2;
      const i = (y * w + x) * 4;
      img.data[i] = 128 + 127 * (-dx / len) * m;
      img.data[i + 1] = 128 + 127 * (-dy / len) * m;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    lensMap.setAttribute('href', canvas.toDataURL());
    lensMap.setAttribute('width', w);
    lensMap.setAttribute('height', h);
    lens.setAttribute('width', w);
    lens.setAttribute('height', h);
    bar.classList.add('refract');
  };

  const morphBar = () => {
    const from = bar.offsetWidth;
    bar.style.width = 'auto';
    const to = Math.min(bar.offsetWidth, innerWidth - 24);
    bar.style.width = from + 'px';
    bar.offsetWidth;
    bar.style.width = to + 'px';
    drawLens(to, bar.offsetHeight);
    const s = $('.seg', ctl);
    if (s) requestAnimationFrame(() => placeThumb(s));
  };

  /* The sheet stack */
  const sheets = $$('.sheet');
  const anchors = $$('.anchor');
  const measure = () => {};

  /* The bar's ink comes from the sheet physically under it, which can differ from the sheet being read.
     Tones and hues are read once, so scrolling never asks for computed style. */
  const tones = sheets.map(s => luminance(hexRgb(getComputedStyle(s).getPropertyValue('--ink'))) > .5 ? 'dark' : 'light');
  const hues = sheets.map(s => getComputedStyle(s).getPropertyValue('--neon').trim());
  const hueTargets = [bar, document.querySelector('.wire')];
  let active = -1;
  const setActive = i => {
    if (i === active) return;
    active = i;
    const s = sheets[i];
    hueTargets.forEach(t => t?.style.setProperty('--hue', hues[i]));
    renderControls(CONTROLS[s.dataset.label]);
    morphBar();
  };

  /* Pages: one at a time, and the page itself never scrolls. A request to go somewhere is a
     cancelable 'page:go' event. The motion layer takes it and travels through the light; without
     it, the page simply switches. */
  document.documentElement.classList.add('app');
  const ids = anchors.map(a => a.id);
  const show = (id, push = true) => {
    const i = ids.indexOf(id);
    if (i < 0) return;
    sheets.forEach((s, j) => { s.hidden = j !== i; });
    sheets[i].scrollTop = 0;
    setActive(i);
    bar.dataset.tone = tones[i];
    document.documentElement.dataset.page = id;
    if (push) history.pushState(null, '', id === 'top' ? location.pathname : '#' + id);
    document.dispatchEvent(new CustomEvent('page:change', { detail: { id, index: i } }));
  };
  const go = (id, push = true, origin = null) => {
    if (!ids.includes(id) || id === document.documentElement.dataset.page) return;
    const ok = document.dispatchEvent(new CustomEvent('page:go', { detail: { id, push, origin }, cancelable: true }));
    if (ok) show(id, push);
  };
  window.sitePages = { ids, show, go, labels: sheets.map(s => s.dataset.label) };

  /* Every in-page link is a door, not a scroll. */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    go(a.getAttribute('href').slice(1) || 'top');
  });
  addEventListener('popstate', () => go(location.hash.slice(1) || 'top', false));
  addEventListener('resize', () => morphBar());

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!e.target.closest('input, textarea, select')) {
      if (e.key === 'Escape') { go('top'); return; }
      if (e.key === 'ArrowRight') { go(ids[Math.min(active + 1, ids.length - 1)]); return; }
      if (e.key === 'ArrowLeft') { go(ids[Math.max(active - 1, 0)]); return; }
    }
    if (sheets[active]?.dataset.label !== 'Skills') return;
    if (e.key === 'j') moveRow(1);
    if (e.key === 'k') moveRow(-1);
  });

  show(ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'top', false);
  document.fonts?.ready.then(() => morphBar());

  /* The project chips are doors too. */
  $$('.legend .chip').forEach(b => b.addEventListener('click', () => window.sitePages.go(b.dataset.go)));

  /* The page reports its own weight by reading its own files, so a cached visit stays accurate. */
  addEventListener('load', async () => {
    const entries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
      .filter(e => e.name.startsWith('http'));
    const local = [...new Set(entries.map(e => e.name).filter(u => new URL(u).origin === location.origin))];
    const thirdParty = entries.length - entries.filter(e => new URL(e.name).origin === location.origin).length;
    try {
      const sizes = await Promise.all(local.map(u => fetch(u, { cache: 'force-cache' }).then(r => r.arrayBuffer()).then(b => b.byteLength)));
      const bytes = sizes.reduce((a, b) => a + b, 0);
      if (!bytes) return;
      if (!$('#weight')) return;
      $('#weight').textContent = `This page weighs ${Math.round(bytes / 1024)} KB, measured just now, with ${thirdParty ? thirdParty + ' third-party requests' : 'no third-party requests'}.`;
      measure();
    } catch { /* Opened from disk, where fetch is unavailable. The line stays hidden. */ }
  });
})();
