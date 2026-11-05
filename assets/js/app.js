/* File: assets/js/app.js
 * Page shell: tabs, setup guide + progress tracker, Hermes/Resources content, theme.
 */
(function () {
  const C = window.CCC_CONTENT;
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---------------- Tabs (hash-routed so links are shareable) ----------------
  const TABS = ['overview', 'guide', 'dashboard', 'hermes', 'resources'];
  function showTab(name, push = true) {
    if (!TABS.includes(name)) name = 'overview';
    document.querySelectorAll('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    TABS.forEach((t) => { $(`#tab-${t}`).hidden = t !== name; });
    if (push && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    window.scrollTo({ top: 0 });
  }
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-tab-link]'); if (a) { e.preventDefault(); showTab(a.dataset.tabLink); } });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1), false));

  // ---------------- Overview links ----------------
  const linkItems = (list) => list.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a></li>`).join('');
  $('#sessionLinks').innerHTML = linkItems(C.sessionLinks);
  $('#docLinks').innerHTML = linkItems(C.docLinks);

  // ---------------- Guide ----------------
  const BADGE = { read: '<span class="badge badge-read">READ ONLY</span>', modifies: '<span class="badge badge-mod">MODIFIES CANVAS</span>' };
  let done = new Set(store.get('ccc.done', []));
  let os = store.get('ccc.os', 'windows');

  function renderGuide() {
    $('#guideToc').innerHTML = C.phases.map((p, i) => {
      const steps = C.steps.filter((s) => s.phase === p.id);
      const n = steps.filter((s) => done.has(s.id)).length;
      return `<a href="#${p.id}" data-jump="${p.id}"><span class="toc-num">${i + 1}</span><span>${esc(p.title)}</span><span class="toc-count">${n}/${steps.length}</span></a>`;
    }).join('');

    let n = 0;
    $('#guideSteps').innerHTML = C.phases.map((p, i) => `
      <section class="phase" id="${p.id}">
        <h2><span class="phase-num">Phase ${i + 1}</span> ${esc(p.title)}</h2>
        ${C.steps.filter((s) => s.phase === p.id).map((s) => { n += 1; return stepHtml(s, n); }).join('')}
      </section>`).join('');
    updateProgress();
  }

  function stepHtml(s, n) {
    const cmds = s.commands.filter((c) => c.os === 'any' || c.os === os);
    return `
      <article class="step card${done.has(s.id) ? ' is-done' : ''}" id="${s.id}">
        <header class="step-head">
          <label class="check"><input type="checkbox" data-step="${s.id}" ${done.has(s.id) ? 'checked' : ''} aria-label="Mark step ${n} done"><span class="step-num">${n}</span></label>
          <h3>${esc(s.title)}</h3>
          <div class="step-tags">${BADGE[s.badge] || ''}</div>
        </header>
        <p class="why"><strong>Why:</strong> ${esc(s.why)}</p>
        <div class="step-body">${s.body}</div>
        ${cmds.map((c) => `
          <div class="cmd">
            <div class="cmd-head"><span>${esc(c.shell)}</span><button type="button" class="copy" data-copy>Copy</button></div>
            <pre><code>${esc(c.code)}</code></pre>
          </div>`).join('')}
        <p class="verify"><strong>Check it worked:</strong> ${s.verify}</p>
      </article>`;
  }

  function updateProgress() {
    const total = C.steps.length;
    const n = C.steps.filter((s) => done.has(s.id)).length;
    $('#progressText').textContent = `${n} of ${total} steps done`;
    $('#progressBar').style.width = `${Math.round((n / total) * 100)}%`;
  }

  $('#guideSteps').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-step]');
    if (!cb) return;
    cb.checked ? done.add(cb.dataset.step) : done.delete(cb.dataset.step);
    store.set('ccc.done', [...done]);
    cb.closest('.step').classList.toggle('is-done', cb.checked);
    renderGuideTocOnly();
    updateProgress();
  });
  function renderGuideTocOnly() {
    C.phases.forEach((p) => {
      const steps = C.steps.filter((s) => s.phase === p.id);
      const a = document.querySelector(`[data-jump="${p.id}"] .toc-count`);
      if (a) a.textContent = `${steps.filter((s) => done.has(s.id)).length}/${steps.length}`;
    });
  }
  $('#guideToc').addEventListener('click', (e) => {
    const a = e.target.closest('[data-jump]');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#resetProgress').addEventListener('click', () => { done = new Set(); store.set('ccc.done', []); renderGuide(); toast('Progress reset'); });

  document.querySelectorAll('input[name=os]').forEach((r) => {
    r.checked = r.value === os;
    r.addEventListener('change', () => { os = r.value; store.set('ccc.os', os); renderGuide(); });
  });

  // Copy buttons (guide commands and Hermes prompts)
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const text = b.closest('.cmd, .prompt').querySelector('code').textContent;
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed — select the text manually'); }
  });

  // ---------------- Hermes + Resources ----------------
  $('#hermesCards').innerHTML = C.hermesCards.map((c) => `<article class="card"><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></article>`).join('');
  $('#promptList').innerHTML = C.prompts.map((p) => `
    <div class="prompt cmd"><div class="cmd-head"><span>Hermes prompt</span><button type="button" class="copy" data-copy>Copy</button></div><pre><code>${esc(p)}</code></pre></div>`).join('');
  $('#endpointTable').innerHTML = `<thead><tr><th>Method</th><th>Endpoint</th><th>Purpose</th></tr></thead><tbody>${C.endpoints.map(([m, p, d]) => `<tr><td><span class="badge badge-read">${m}</span></td><td><code>${esc(p)}</code></td><td>${esc(d)}</td></tr>`).join('')}</tbody>`;
  // Roadmap entries are trusted, hand-written HTML from guide-data.js (they contain <code> tags),
  // so they are not escaped. Never feed Canvas or user data into C.roadmap.
  $('#roadmap').innerHTML = C.roadmap.map((r) => `<li>${r}</li>`).join('');

  // ---------------- Theme ----------------
  const savedTheme = store.get('ccc.theme', null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('ccc.theme', next);
  });

  // ---------------- Boot ----------------
  renderGuide();
  window.CCC_Dashboard.init();
  showTab(location.hash.slice(1) || 'overview', false);
})();
