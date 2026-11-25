/* File: assets/js/dashboard.js
 * READ ONLY Canvas dashboard UI: course list, search/filter, course views,
 * and a "Quick review" that flags common course-structure issues.
 */
(function () {
  const { ProxyClient, DemoClient } = window.CCC_Canvas;
  const $ = (sel) => document.querySelector(sel);

  // Escape anything that came from Canvas before inserting it as HTML.
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Display only: drop emoji/pictographic icons from Canvas titles (🚀, 🎗️, 🐞 ...).
  // Keeps ©, ® and ™, and keeps the original if a title is nothing but emoji.
  // Canvas data itself is never changed; URLs and ids keep using esc() untouched.
  const ICONS = /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}\u200D\uFE0F\u20E3]/gu;
  const plain = (v) => { const s = String(v ?? ''); const t = s.replace(ICONS, '').replace(/\s{2,}/g, ' ').trim(); return t || s; };
  const txt = (v) => esc(plain(v));
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const fmtSize = (b) => (b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const pill = (ok, yes = 'Published', no = 'Unpublished') =>
    `<span class="pill ${ok ? 'pill-ok' : 'pill-warn'}">${ok ? yes : no}</span>`;

  // Canvas returns html_url on live data; demo data has none, so fall back to plain
  // text. Only ever linkify a real https:// URL, and still escape it for the attribute.
  // READ ONLY from this app's side: Canvas does the editing, under Canvas's own permissions.
  const canvasUrl = (u) => (/^https:\/\/[^"'\s]+$/.test(String(u ?? '')) ? String(u) : null);
  const canvasEditUrl = (htmlUrl) => { const u = canvasUrl(htmlUrl); return u ? `${u}/edit` : null; };
  // Modules and Files get no html_url from Canvas, so build those from the base URL
  // /health reports. Null in demo mode, which leaves the text unlinked.
  const courseUrl = (suffix) =>
    (state.canvasBase && state.selected ? canvasUrl(`${state.canvasBase}/courses/${state.selected.id}${suffix}`) : null);
  const linkTo = (url, text, label = 'Open in Canvas') =>
    (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(label)} (opens in a new tab)">${txt(text)}</a>` : txt(text));
  const canvasEditLink = (htmlUrl, text) => linkTo(canvasEditUrl(htmlUrl), text, 'Edit in Canvas');

  const state = { client: null, courses: [], selected: null, view: 'modules', cache: {}, canvasBase: null };

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
    state.canvasBase = null;
    $('#subtabs').hidden = true;
    $('#courseHeader').innerHTML = '<p class="empty">Select a course.</p>';
    $('#viewBody').innerHTML = '';
    setStatus('Connecting…', 'busy');
    try {
      const health = await client.health();
      // The proxy reports the Canvas host; demo mode doesn't, so links stay off there.
      state.canvasBase = canvasUrl(health?.canvas);
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
        <span class="course-name">${txt(c.name)}</span>
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
        <h2>${txt(c.name)}</h2>
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
      syllabus: () => cached('syllabus', () => c.syllabus(id)).then(renderSyllabus),
      pages: () => cached('pages', () => c.pages(id)).then(renderPages),
      assignments: () => cached('assignments', () => c.assignments(id)).then(renderAssignments),
      announcements: () => cached('announcements', () => c.announcements(id)).then(renderAnnouncements),
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
    guard('modules', `
      <div class="review-head">
        <p><strong>${mods.length}</strong> module${mods.length === 1 ? '' : 's'}. <span class="badge badge-read">READ ONLY</span> Export gathers every page, assignment and discussion in module order.</p>
        <span class="export-actions">
          <button type="button" class="btn btn-small" data-export-content="docx">Export for Google Docs (.docx)</button>
          <button type="button" class="btn btn-small" data-export-content="md">Markdown (.md)</button>
        </span>
      </div>
      <p class="hint small">Upload the .docx to Google Drive and open it — Drive converts it to a Google Doc. Embedded media is marked in place, not reproduced.</p>
      <div class="modules">${mods.map((m) => `
      <details class="module" open>
        <summary><span class="module-name">${linkTo(courseUrl(`/modules#context_module_${m.id}`), m.name, 'Open this module in Canvas')}</span> ${pill(m.published !== false)} <span class="count">${m.items_count ?? m.items?.length ?? 0} items</span></summary>
        ${m.items ? `<ul class="items">${m.items.map((it) => `
          <li><span class="type type-${esc(String(it.type).toLowerCase())}">${esc(it.type)}</span>
            ${it.type === 'Page' && it.page_url
              ? linkTo(courseUrl(`/pages/${encodeURIComponent(it.page_url)}/edit`), it.title, 'Edit in Canvas')
                + ` <button type="button" class="linkish" data-open-page="${esc(it.page_url)}">Preview</button>`
              : linkTo(canvasUrl(it.html_url), it.title)}
            ${it.published === false ? pill(false) : ''}</li>`).join('') || '<li class="empty">No items</li>'}</ul>`
          : `<button type="button" class="btn btn-small" data-load-items="${m.id}">Load items</button>`}
      </details>`).join('')}</div>`);
  }

  function renderPages(pages) {
    guard('pages', table(['Title', 'Status', 'Updated', ''], pages.map((p) => `
      <tr><td>${canvasEditLink(p.html_url, p.title)}${p.front_page ? ' <span class="pill">Front page</span>' : ''}</td><td>${pill(p.published)}</td>
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
          <div class="page-preview-head"><h3>${txt(p.title)}</h3><span class="badge badge-read">READ ONLY preview</span>
          <button type="button" class="linkish" data-close-preview>Close</button></div>
          <iframe title="Page preview: ${txt(p.title)}" sandbox="" referrerpolicy="no-referrer"></iframe>
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
      <tr><td>${canvasEditLink(a.html_url, a.name)}</td><td>${a.due_at ? fmtDate(a.due_at) : '<span class="pill pill-warn">No due date</span>'}</td>
      <td>${a.points_possible ?? '—'}</td><td>${pill(a.published)}</td></tr>`), 'No assignments.'));
  }

  // Canvas has no separate editor URL for the syllabus: the Syllabus page edits inline.
  function renderSyllabus(course) {
    const body = course && course.syllabus_body;
    const link = courseUrl('/assignments/syllabus');
    guard('syllabus', `
      <div class="page-preview">
        <div class="page-preview-head"><h3>Syllabus</h3><span class="badge badge-read">READ ONLY preview</span>
        ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Edit in Canvas</a>` : ''}</div>
        ${body
          ? '<iframe title="Syllabus preview" sandbox="" referrerpolicy="no-referrer"></iframe><p class="hint small">Scripts are disabled in the preview. The link opens the Syllabus page, where Edit is inline.</p>'
          : '<p class="empty">This course has no syllabus content.</p>'}
      </div>`);
    if (!body || state.view !== 'syllabus') return;
    // sandbox="" blocks scripts, forms, and navigation in the Canvas HTML.
    const frame = $('#viewBody iframe');
    if (frame) frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.5 system-ui,sans-serif;margin:16px;color:#1f2933}img{max-width:100%}</style>${body}`;
  }

  function renderAnnouncements(list) {
    guard('announcements', table(['Announcement', 'Posted', 'Status'], list.map((a) => `
      <tr><td>${canvasEditLink(a.html_url, a.title)}</td><td>${fmtDate(a.posted_at || a.created_at)}</td><td>${pill(a.published)}</td></tr>`),
    'No announcements.') + '<p class="hint small">Announcements come from the discussion_topics endpoint with only_announcements=true.</p>');
  }

  function renderDiscussions(list) {
    guard('discussions', table(['Topic', 'Type', 'Posted', 'Status'], list.map((d) => `
      <tr><td>${canvasEditLink(d.html_url, d.title)}</td><td>${esc(d.discussion_type || '—')}</td><td>${fmtDate(d.posted_at)}</td><td>${pill(d.published)}</td></tr>`), 'No discussions.'));
  }

  function renderQuizzes(list) {
    guard('quizzes', table(['Quiz', 'Type', 'Questions', 'Points', 'Status'], list.map((q) => `
      <tr><td>${canvasEditLink(q.html_url, q.title)}</td><td>${esc(q.quiz_type || '—')}</td><td>${q.question_count ?? '—'}</td><td>${q.points_possible ?? '—'}</td><td>${pill(q.published)}</td></tr>`),
    'No Classic Quizzes.') + '<p class="hint small">This endpoint lists Classic Quizzes only. New Quizzes show up under Assignments.</p>');
  }

  function renderFiles(list) {
    guard('files', table(['File', 'Size', 'Updated'], list.map((f) => `
      <tr><td>${linkTo(courseUrl(`/files/${f.id}`), f.display_name, 'Open in Canvas Files')}${f.locked ? ' <span class="pill pill-warn">Locked</span>' : ''}</td><td>${fmtSize(f.size)}</td><td>${fmtDate(f.updated_at)}</td></tr>`), 'No files.'));
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
    const add = (area, issue, item, url = null) => findings.push({ area, issue, item: plain(item), url });

    (mods || []).forEach((m) => {
      if (m.published === false) add('Modules', 'Unpublished module', m.name, courseUrl(`/modules#context_module_${m.id}`));
      if ((m.items_count ?? m.items?.length ?? 0) === 0) add('Modules', 'Empty module', m.name, courseUrl(`/modules#context_module_${m.id}`));
      (m.items || []).forEach((it) => { if (it.published === false) add('Module items', `Unpublished ${it.type}`, `${m.name} › ${it.title}`, canvasUrl(it.html_url)); });
    });
    const linked = new Set((mods || []).flatMap((m) => (m.items || []).filter((i) => i.type === 'Page').map((i) => i.page_url)));
    (pages || []).forEach((p) => { if (!linked.has(p.url) && !p.front_page) add('Pages', 'Not linked from any module', p.title, canvasEditUrl(p.html_url)); });
    (asg || []).forEach((a) => {
      if (!a.due_at) add('Assignments', 'No due date', a.name, canvasEditUrl(a.html_url));
      if (!a.points_possible) add('Assignments', '0 or missing points', a.name, canvasEditUrl(a.html_url));
    });
    (disc || []).forEach((d) => { if (d.published === false) add('Discussions', 'Unpublished', d.title, canvasEditUrl(d.html_url)); });
    (quiz || []).forEach((q) => { if (q.published === false) add('Quizzes', 'Unpublished', q.title, canvasEditUrl(q.html_url)); });

    // Naming consistency: "Week N" vs "Wk N" and similar.
    const names = (mods || []).map((m) => m.name);
    const styles = new Set(names.map((n) => (n.match(/^(week|wk|module|unit|lesson)\b/i) || [])[1]?.toLowerCase()).filter(Boolean));
    if (styles.size > 1) add('Naming', `Mixed module prefixes: ${[...styles].join(', ')}`, names.join(' · '));

    const unavailable = [['modules', mods], ['pages', pages], ['assignments', asg], ['discussions', disc], ['quizzes', quiz]].filter(([, v]) => v == null).map(([k]) => k);

    guard('review', `
      <div class="review-head">
        <p><strong>${findings.length}</strong> potential issue${findings.length === 1 ? '' : 's'} found. <span class="badge badge-read">READ ONLY</span> These are prompts for your judgment; some may be intentional.</p>
        ${findings.length ? '<button type="button" class="btn btn-small" data-export-review>Download report</button>' : ''}
      </div>
      ${unavailable.length ? `<p class="hint small">Couldn't read: ${unavailable.join(', ')} (permission or feature disabled).</p>` : ''}
      ${table(['Area', 'Issue', 'Item'], findings.map((f) => `<tr><td>${esc(f.area)}</td><td>${esc(f.issue)}</td><td>${linkTo(f.url, f.item)}</td></tr>`), 'Nothing flagged. Nice.')}`);
    state.lastReview = findings;
  }

  function download(filename, payload) {
    const blob = payload instanceof Blob ? payload : new Blob([payload], { type: 'text/markdown' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------- Module content export (READ ONLY) ----------------
  // Walks modules in order, pulls each item's body, and writes one Markdown
  // document an instructor can review without a Canvas account.
  async function exportModuleContent(btn, format) {
    const c = state.client;
    const course = state.selected;
    const base = state.canvasBase;
    const label = btn.textContent;
    btn.disabled = true;
    try {
      btn.textContent = 'Loading…';
      // A disabled tool shouldn't sink the whole export.
      const settle = (p) => p.then((v) => v, () => []);
      const [mods, asg, disc, quiz] = await Promise.all([
        cached('modules', () => c.modules(course.id)),
        settle(cached('assignments', () => c.assignments(course.id))),
        settle(cached('discussions', () => c.discussions(course.id))),
        settle(cached('quizzes', () => c.quizzes(course.id))),
      ]);
      const index = (list) => new Map((list || []).map((x) => [x.id, x]));
      const A = index(asg), D = index(disc), Q = index(quiz);

      // Canvas omits `items` from very large modules; fetch those separately.
      const full = [];
      for (const m of mods) {
        full.push({ ...m, items: m.items || await c.moduleItems(course.id, m.id) || [] });
      }

      const md = (html) => window.CCC_Export.htmlToMarkdown(html, base);
      const total = full.reduce((t, m) => t + m.items.length, 0);
      const stamp = new Date().toLocaleString();
      const out = [
        `# ${course.name} — module content`, '',
        `Exported ${stamp} by Canvas Command Center. READ ONLY: nothing in Canvas was changed.`, '',
        `Canvas course ID ${course.id} · ${course.term?.name || 'no term'} · ${full.length} module(s), ${total} item(s)`, '',
        '> Embedded media — Canvas-hosted images, Kaltura video, H5P and other iframes —',
        '> cannot be reproduced in a document. Each one is marked in place below.', '',
        '## Contents', '',
        ...full.map((m, i) => `${i + 1}. ${m.name}${m.published === false ? ' (unpublished)' : ''}`),
        '', '---', '',
      ];

      let done = 0;
      for (const m of full) {
        out.push(`## ${m.name}${m.published === false ? '  — _unpublished_' : ''}`, '');
        if (!m.items.length) out.push('_(no items)_', '');
        for (const it of m.items) {
          btn.textContent = `Exporting ${++done}/${total}…`;
          const state_ = it.published === false ? '  — _unpublished_' : '';
          if (it.type === 'SubHeader') { out.push(`### ${it.title}${state_}`, ''); continue; }
          out.push(`### ${it.title}  \`${it.type}\`${state_}`, '');
          try {
            if (it.type === 'Page' && it.page_url) {
              out.push(md((await c.page(course.id, it.page_url)).body), '');
            } else if (it.type === 'Assignment') {
              const a = A.get(it.content_id);
              if (a?.due_at) out.push(`**Due:** ${fmtDate(a.due_at)}`, '');
              if (a?.points_possible != null) out.push(`**Points:** ${a.points_possible}`, '');
              out.push(md(a?.description), '');
            } else if (it.type === 'Discussion') {
              out.push(md(D.get(it.content_id)?.message), '');
            } else if (it.type === 'Quiz') {
              out.push(md(Q.get(it.content_id)?.description), '');
              out.push('> Quiz questions are not exported.', '');
            } else if (it.type === 'ExternalUrl') {
              out.push(`External link: ${it.external_url || '(no URL)'}`, '');
            } else {
              out.push(`> **[${it.type} — not exportable as text]**`, '');
            }
          } catch (err) {
            // One unreadable item shouldn't lose the whole export.
            out.push(`> **[Could not read this item: ${err.message}]**`, '');
          }
        }
      }
      const markdown = out.join('\n');
      if (format === 'docx') {
        // The .docx renders from this same Markdown, so the two downloads cannot drift.
        download(`course-content_${course.id}_v1.docx`, window.CCC_Docx.fromMarkdown(markdown));
      } else {
        download(`course-content_${course.id}_v1.md`, markdown);
      }
    } catch (err) {
      $('#viewBody').insertAdjacentHTML('afterbegin', errorBox(err));
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function exportReview() {
    const c = state.selected;
    // Pipes break table cells; square brackets break [text](url).
    const md = (v) => String(v).replace(/\|/g, '\\|').replace(/([[\]])/g, '\\$1');
    const lines = [
      `# Course review — ${plain(c.name)} (ID ${c.id})`, '',
      `Generated ${new Date().toLocaleString()} by Canvas Command Center (READ ONLY; no changes were made).`, '',
      'Links open each item in Canvas. Page, assignment, discussion and quiz links go',
      'straight to its edit screen; editing happens in Canvas, not in this dashboard.', '',
      '| Area | Issue | Item |', '|---|---|---|',
      ...state.lastReview.map((f) => `| ${f.area} | ${md(f.issue)} | ${f.url ? `[${md(f.item)}](${f.url})` : md(f.item)} |`),
    ];
    download(`course-review_${c.id}_v1.md`, lines.join('\n'));
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
      else if (t.closest('[data-export-content]')) { const b = t.closest('[data-export-content]'); exportModuleContent(b, b.dataset.exportContent); }
      else if (t.closest('[data-load-items]')) loadModuleItems(t.closest('[data-load-items]').dataset.loadItems, t.closest('[data-load-items]'));
    });
  }

  window.CCC_Dashboard = { init };
})();
