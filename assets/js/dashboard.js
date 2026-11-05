/* File: assets/js/dashboard.js
 * READ ONLY Canvas dashboard UI: course list, search/filter, course views,
 * and a "Quick review" that flags common course-structure issues.
 */
(function () {
  const { ProxyClient, DemoClient } = window.CCC_Canvas;
  const $ = (sel) => document.querySelector(sel);

  // Escape anything that came from Canvas before inserting it as HTML.
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const fmtSize = (b) => (b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const pill = (ok, yes = 'Published', no = 'Unpublished') =>
    `<span class="pill ${ok ? 'pill-ok' : 'pill-warn'}">${ok ? yes : no}</span>`;

  const state = { client: null, courses: [], selected: null, view: 'modules', cache: {} };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };

  function setStatus(text, kind = 'idle') {
    const el = $('#connStatus');
    el.textContent = text;
    el.dataset.kind = kind;
  }

  function errorBox(err) {
    const status = err.status ? ` (HTTP ${err.status})` : '';
    const canvasMsg = err.detail?.canvas?.errors?.[0]?.message || err.detail?.canvas?.message || '';
    return `<div class="error-box"><strong>Couldn't load this${status}.</strong> ${esc(err.message)}${canvasMsg ? `<br><small>Canvas said: ${esc(canvasMsg)}</small>` : ''}</div>`;
  }

  // ---------------- Connect ----------------
  async function connect(client) {
    state.client = client;
    state.cache = {};
    state.selected = null;
    $('#subtabs').hidden = true;
    $('#courseHeader').innerHTML = '<p class="empty">Select a course.</p>';
    $('#viewBody').innerHTML = '';
    setStatus('Connecting…', 'busy');
    try {
      await client.health();
      const me = await client.self();
      setStatus(`${client.mode === 'demo' ? 'Demo data' : 'Connected'} · ${me.name}`, client.mode === 'demo' ? 'demo' : 'ok');
      await loadCourses();
    } catch (err) {
      setStatus('Connection failed', 'err');
      $('#courses').innerHTML = `<li>${errorBox(err)}</li>`;
      if (client.mode === 'proxy' && location.protocol === 'https:') {
        $('#courses').insertAdjacentHTML('beforeend', '<li class="hint small">Opening this page from GitHub Pages? Add your Pages origin to ALLOWED_ORIGINS in proxy/.env, allow local network access if the browser asks, or open http://127.0.0.1:8787/ instead.</li>');
      }
    }
  }

  async function loadCourses() {
    $('#courses').innerHTML = '<li class="empty">Loading courses…</li>';
    try {
      const list = await state.client.courses();
      // Canvas can return restricted entries without a name; keep only usable ones.
      state.courses = (list || []).filter((c) => c && c.name).sort((a, b) => a.name.localeCompare(b.name));
      renderCourses();
    } catch (err) {
      $('#courses').innerHTML = `<li>${errorBox(err)}</li>`;
    }
  }

  function renderCourses() {
    const q = $('#courseSearch').value.trim().toLowerCase();
    const f = $('#courseFilter').value;
    const rows = state.courses.filter((c) =>
      (f === 'all' || c.workflow_state === f) &&
      (!q || `${c.name} ${c.course_code} ${c.id}`.toLowerCase().includes(q)));
    if (!rows.length) {
      $('#courses').innerHTML = `<li class="empty">${state.courses.length ? 'No courses match.' : 'No active courses returned.'}</li>`;
      return;
    }
    $('#courses').innerHTML = rows.map((c) => `
      <li><button type="button" class="course-btn${state.selected?.id === c.id ? ' active' : ''}" data-id="${c.id}">
        <span class="course-name">${esc(c.name)}</span>
        <span class="course-meta">${esc(c.course_code)} · ID ${c.id} ${c.workflow_state === 'available' ? '' : '<span class="pill pill-warn">Unpublished</span>'}</span>
      </button></li>`).join('');
  }

  // ---------------- Course ----------------
  async function selectCourse(id) {
    const c = state.courses.find((x) => x.id === Number(id));
    if (!c) return;
    state.selected = c;
    renderCourses();
    $('#courseHeader').innerHTML = `
      <div>
        <h2>${esc(c.name)}</h2>
        <p class="course-meta">${esc(c.course_code)} · Canvas ID <code>${c.id}</code> · ${esc(c.term?.name || 'No term')} · ${pill(c.workflow_state === 'available')}</p>
      </div>`;
    $('#subtabs').hidden = false;
    showView(state.view);
  }

  async function cached(key, fn) {
    const k = `${state.selected.id}:${key}`;
    if (!(k in state.cache)) state.cache[k] = await fn();
    return state.cache[k];
  }

  function showView(view) {
    state.view = view;
    document.querySelectorAll('#subtabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
    const body = $('#viewBody');
    body.innerHTML = '<p class="empty">Loading…</p>';
    const id = state.selected.id;
    const c = state.client;
    const run = {
      modules: () => cached('modules', () => c.modules(id)).then(renderModules),
      pages: () => cached('pages', () => c.pages(id)).then(renderPages),
      assignments: () => cached('assignments', () => c.assignments(id)).then(renderAssignments),
      discussions: () => cached('discussions', () => c.discussions(id)).then(renderDiscussions),
      quizzes: () => cached('quizzes', () => c.quizzes(id)).then(renderQuizzes),
      files: () => cached('files', () => c.files(id)).then(renderFiles),
      review: renderReview,
    }[view];
    run().catch((err) => { if (state.view === view) body.innerHTML = errorBox(err); });
  }

  const guard = (view, html) => { if (state.view === view) $('#viewBody').innerHTML = html; };
  const table = (head, rows, empty) => rows.length
    ? `<div class="table-wrap"><table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : `<p class="empty">${empty}</p>`;

  function renderModules(mods) {
    if (!mods.length) return guard('modules', '<p class="empty">This course has no modules.</p>');
    guard('modules', `<div class="modules">${mods.map((m) => `
      <details class="module" open>
        <summary><span class="module-name">${esc(m.name)}</span> ${pill(m.published !== false)} <span class="count">${m.items_count ?? m.items?.length ?? 0} items</span></summary>
        ${m.items ? `<ul class="items">${m.items.map((it) => `
          <li><span class="type type-${esc(String(it.type).toLowerCase())}">${esc(it.type)}</span>
            ${it.type === 'Page' && it.page_url ? `<button type="button" class="linkish" data-open-page="${esc(it.page_url)}">${esc(it.title)}</button>` : `<span>${esc(it.title)}</span>`}
            ${it.published === false ? pill(false) : ''}</li>`).join('') || '<li class="empty">No items</li>'}</ul>`
          : `<button type="button" class="btn btn-small" data-load-items="${m.id}">Load items</button>`}
      </details>`).join('')}</div>`);
  }

  function renderPages(pages) {
    guard('pages', table(['Title', 'Status', 'Updated', ''], pages.map((p) => `
      <tr><td>${esc(p.title)}${p.front_page ? ' <span class="pill">Front page</span>' : ''}</td><td>${pill(p.published)}</td>
      <td>${fmtDate(p.updated_at)}</td><td><button type="button" class="btn btn-small" data-open-page="${esc(p.url)}">View</button></td></tr>`),
    'No pages (or Pages is disabled in this course).') + '<div id="pagePreview"></div>');
    if (state.pendingPage) { const u = state.pendingPage; state.pendingPage = null; openPage(u); }
  }

  async function openPage(url) {
    if (state.view !== 'pages') {
      // Switch to the Pages view; renderPages() opens the preview once it's drawn.
      state.pendingPage = url;
      showView('pages');
      return;
    }
    const box = document.getElementById('pagePreview');
    if (!box) return;
    box.innerHTML = '<p class="empty">Loading page…</p>';
    try {
      const p = await state.client.page(state.selected.id, url);
      box.innerHTML = `
        <div class="page-preview">
          <div class="page-preview-head"><h3>${esc(p.title)}</h3><span class="badge badge-read">READ ONLY preview</span>
          <button type="button" class="linkish" data-close-preview>Close</button></div>
          <iframe title="Page preview: ${esc(p.title)}" sandbox="" referrerpolicy="no-referrer"></iframe>
          <p class="hint small">Scripts are disabled in the preview. Editing pages is a later phase (see Resources → Roadmap).</p>
        </div>`;
      // sandbox="" blocks scripts, forms, and navigation in the Canvas HTML.
      box.querySelector('iframe').srcdoc = `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.5 system-ui,sans-serif;margin:16px;color:#1f2933}img{max-width:100%}</style>${p.body || '<p><em>(empty page)</em></p>'}`;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      box.innerHTML = errorBox(err);
    }
  }

  function renderAssignments(list) {
    guard('assignments', table(['Assignment', 'Due', 'Points', 'Status'], list.map((a) => `
      <tr><td>${esc(a.name)}</td><td>${a.due_at ? fmtDate(a.due_at) : '<span class="pill pill-warn">No due date</span>'}</td>
      <td>${a.points_possible ?? '—'}</td><td>${pill(a.published)}</td></tr>`), 'No assignments.'));
  }

  function renderDiscussions(list) {
    guard('discussions', table(['Topic', 'Type', 'Posted', 'Status'], list.map((d) => `
      <tr><td>${esc(d.title)}</td><td>${esc(d.discussion_type || '—')}</td><td>${fmtDate(d.posted_at)}</td><td>${pill(d.published)}</td></tr>`), 'No discussions.'));
  }

  function renderQuizzes(list) {
    guard('quizzes', table(['Quiz', 'Type', 'Questions', 'Points', 'Status'], list.map((q) => `
      <tr><td>${esc(q.title)}</td><td>${esc(q.quiz_type || '—')}</td><td>${q.question_count ?? '—'}</td><td>${q.points_possible ?? '—'}</td><td>${pill(q.published)}</td></tr>`),
    'No Classic Quizzes.') + '<p class="hint small">This endpoint lists Classic Quizzes only. New Quizzes show up under Assignments.</p>');
  }

  function renderFiles(list) {
    guard('files', table(['File', 'Size', 'Updated'], list.map((f) => `
      <tr><td>${esc(f.display_name)}${f.locked ? ' <span class="pill pill-warn">Locked</span>' : ''}</td><td>${fmtSize(f.size)}</td><td>${fmtDate(f.updated_at)}</td></tr>`), 'No files.'));
  }

  // ---------------- Quick review ----------------
  async function renderReview() {
    const id = state.selected.id;
    const c = state.client;
    const settle = (p) => p.then((v) => v, () => null); // a disabled tool shouldn't sink the whole review
    const [mods, pages, asg, disc, quiz] = await Promise.all([
      settle(cached('modules', () => c.modules(id))),
      settle(cached('pages', () => c.pages(id))),
      settle(cached('assignments', () => c.assignments(id))),
      settle(cached('discussions', () => c.discussions(id))),
      settle(cached('quizzes', () => c.quizzes(id))),
    ]);
    const findings = [];
    const add = (area, issue, item) => findings.push({ area, issue, item });

    (mods || []).forEach((m) => {
      if (m.published === false) add('Modules', 'Unpublished module', m.name);
      if ((m.items_count ?? m.items?.length ?? 0) === 0) add('Modules', 'Empty module', m.name);
      (m.items || []).forEach((it) => { if (it.published === false) add('Module items', `Unpublished ${it.type}`, `${m.name} › ${it.title}`); });
    });
    const linked = new Set((mods || []).flatMap((m) => (m.items || []).filter((i) => i.type === 'Page').map((i) => i.page_url)));
    (pages || []).forEach((p) => { if (!linked.has(p.url) && !p.front_page) add('Pages', 'Not linked from any module', p.title); });
    (asg || []).forEach((a) => {
      if (!a.due_at) add('Assignments', 'No due date', a.name);
      if (!a.points_possible) add('Assignments', '0 or missing points', a.name);
    });
    (disc || []).forEach((d) => { if (d.published === false) add('Discussions', 'Unpublished', d.title); });
    (quiz || []).forEach((q) => { if (q.published === false) add('Quizzes', 'Unpublished', q.title); });

    // Naming consistency: "Week N" vs "Wk N" and similar.
    const names = (mods || []).map((m) => m.name);
    const styles = new Set(names.map((n) => (n.match(/^(week|wk|module|unit|lesson)\b/i) || [])[1]?.toLowerCase()).filter(Boolean));
    if (styles.size > 1) add('Naming', `Mixed module prefixes: ${[...styles].join(', ')}`, names.join(' · '));

    const unavailable = [['modules', mods], ['pages', pages], ['assignments', asg], ['discussions', disc], ['quizzes', quiz]].filter(([, v]) => v == null).map(([k]) => k);

    guard('review', `
      <div class="review-head">
        <p><strong>${findings.length}</strong> potential issue${findings.length === 1 ? '' : 's'} found. <span class="badge badge-read">READ ONLY</span> These are prompts for your judgment; some may be intentional.</p>
        ${findings.length ? '<button type="button" class="btn btn-small" data-export-review>Download report (.md)</button>' : ''}
      </div>
      ${unavailable.length ? `<p class="hint small">Couldn't read: ${unavailable.join(', ')} (permission or feature disabled).</p>` : ''}
      ${table(['Area', 'Issue', 'Item'], findings.map((f) => `<tr><td>${esc(f.area)}</td><td>${esc(f.issue)}</td><td>${esc(f.item)}</td></tr>`), 'Nothing flagged. Nice.')}`);
    state.lastReview = findings;
  }

  function exportReview() {
    const c = state.selected;
    const lines = [
      `# Course review — ${c.name} (ID ${c.id})`, '',
      `Generated ${new Date().toLocaleString()} by Canvas Command Center (READ ONLY; no changes were made).`, '',
      '| Area | Issue | Item |', '|---|---|---|',
      ...state.lastReview.map((f) => `| ${f.area} | ${f.issue} | ${String(f.item).replace(/\|/g, '\\|')} |`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `course-review_${c.id}_v1.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function loadModuleItems(moduleId, btn) {
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      const items = await state.client.moduleItems(state.selected.id, moduleId);
      const mods = state.cache[`${state.selected.id}:modules`];
      const m = mods.find((x) => x.id === Number(moduleId));
      m.items = items;
      renderModules(mods);
    } catch (err) {
      btn.outerHTML = errorBox(err);
    }
  }

  // ---------------- Wire up ----------------
  function init() {
    const saved = store.get('ccc.proxyUrl');
    if (saved) $('#proxyUrl').value = saved;
    // When the proxy itself serves this page, it's the obvious default.
    if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && location.port) $('#proxyUrl').value = location.origin;

    $('#connectBtn').addEventListener('click', () => {
      const url = $('#proxyUrl').value.trim();
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
        setStatus('Proxy URL must be http://127.0.0.1:<port> or http://localhost:<port>', 'err');
        return;
      }
      store.set('ccc.proxyUrl', url);
      connect(new ProxyClient(url));
    });
    $('#demoBtn').addEventListener('click', () => connect(new DemoClient(window.CCC_DEMO)));
    $('#courseSearch').addEventListener('input', renderCourses);
    $('#courseFilter').addEventListener('change', renderCourses);
    $('#courses').addEventListener('click', (e) => { const b = e.target.closest('.course-btn'); if (b) selectCourse(b.dataset.id); });
    $('#subtabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b && state.selected) showView(b.dataset.view); });
    $('#viewBody').addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-open-page]')) openPage(t.closest('[data-open-page]').dataset.openPage);
      else if (t.closest('[data-close-preview]')) document.getElementById('pagePreview').innerHTML = '';
      else if (t.closest('[data-export-review]')) exportReview();
      else if (t.closest('[data-load-items]')) loadModuleItems(t.closest('[data-load-items]').dataset.loadItems, t.closest('[data-load-items]'));
    });
  }

  window.CCC_Dashboard = { init };
})();
