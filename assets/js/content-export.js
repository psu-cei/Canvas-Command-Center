/* File: assets/js/content-export.js
 * READ ONLY. Turns a course's modules and their content into one Markdown
 * document an instructor can review without a Canvas account.
 *
 * No dependencies: Canvas HTML is converted by walking the DOM with DOMParser,
 * which is far safer than regex against editor-generated markup.
 *
 * Embedded media (Canvas-hosted images, Kaltura, H5P, iframes) cannot be
 * reproduced in a document. Each one becomes a visible note rather than being
 * silently dropped, so a reviewer always knows something is missing.
 */
(function () {
  // ---------------- HTML -> Markdown ----------------

  // Escape only what would otherwise become Markdown syntax. Deliberately
  // conservative: over-escaping makes prose unreadable ("e.g." -> "e\.g\.").
  const escMd = (s) => s.replace(/([\\`*_[\]])/g, '\\$1');
  const tidy = (s) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');

  function isCanvasHosted(src, base) {
    if (!src) return false;
    if (src.startsWith('/')) return true;              // relative = this Canvas
    return Boolean(base) && src.startsWith(base);
  }

  // Canvas's editor wraps iframes in <p>, so embeds show up on the inline path
  // as often as the block one. Both must handle them or the embed is lost.
  const EMBED = /^(IFRAME|VIDEO|AUDIO|EMBED|OBJECT)$/;
  function embedNote(node) {
    const title = (node.getAttribute('title') || '').trim();
    const raw = node.getAttribute('src') || node.getAttribute('data') || '';
    // Player URLs run to hundreds of characters of query string. Keep enough to
    // identify the source, not the whole thing.
    const src = raw.length > 90 ? `${raw.slice(0, 90)}…` : raw;
    const kind = node.tagName === 'IFRAME' ? 'Embedded media' : `Embedded ${node.tagName.toLowerCase()}`;
    return `**[${kind}${title ? `: ${escMd(title)}` : ''} — not viewable outside Canvas]**${src ? ` \`${src}\`` : ''}`;
  }

  // Inline content: everything that belongs on one line.
  function inline(node, ctx) {
    if (node.nodeType === 3) return escMd(tidy(node.nodeValue));
    if (node.nodeType !== 1) return '';
    const kids = () => [...node.childNodes].map((n) => inline(n, ctx)).join('');
    switch (node.tagName) {
      case 'BR': return '  \n';
      case 'IFRAME': case 'VIDEO': case 'AUDIO': case 'EMBED': case 'OBJECT':
        return embedNote(node);
      case 'STRONG': case 'B': { const t = kids().trim(); return t ? `**${t}**` : ''; }
      case 'EM': case 'I': { const t = kids().trim(); return t ? `*${t}*` : ''; }
      case 'CODE': return `\`${node.textContent.trim()}\``;
      case 'A': {
        const href = node.getAttribute('href') || '';
        const text = kids().trim() || escMd(href);
        return href ? `[${text}](${href})` : text;
      }
      case 'IMG': {
        const src = node.getAttribute('src') || '';
        const alt = (node.getAttribute('alt') || '').trim();
        if (isCanvasHosted(src, ctx.base)) {
          // A Canvas-hosted image needs a session to load, so a reviewer
          // outside Canvas would see a broken image. Say so instead.
          return `**[Image${alt ? `: ${escMd(alt)}` : ''} — only viewable in Canvas]**`;
        }
        return `![${escMd(alt)}](${src})`;
      }
      default: return kids();
    }
  }

  function listBlock(node, ctx, depth) {
    const ordered = node.tagName === 'OL';
    const out = [];
    let i = 1;
    for (const li of [...node.children].filter((c) => c.tagName === 'LI')) {
      const nested = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
      const own = [...li.childNodes].filter((n) => !nested.includes(n));
      const text = own.map((n) => inline(n, ctx)).join('').trim();
      out.push(`${'  '.repeat(depth)}${ordered ? `${i++}.` : '-'} ${text}`);
      for (const sub of nested) out.push(listBlock(sub, ctx, depth + 1));
    }
    return out.join('\n');
  }

  function tableBlock(node, ctx) {
    const rows = [...node.querySelectorAll('tr')];
    if (!rows.length) return '';
    const cellText = (c) => inline(c, ctx).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
    const grid = rows.map((r) => [...r.children].map(cellText));
    const width = Math.max(...grid.map((r) => r.length));
    const pad = (r) => [...r, ...Array(width - r.length).fill('')];
    const [head, ...body] = grid;
    return [
      `| ${pad(head).join(' | ')} |`,
      `| ${Array(width).fill('---').join(' | ')} |`,
      ...body.map((r) => `| ${pad(r).join(' | ')} |`),
    ].join('\n');
  }

  // Block content: everything that needs blank lines around it.
  function block(node, ctx) {
    if (node.nodeType === 3) { const t = tidy(node.nodeValue).trim(); return t ? escMd(t) : ''; }
    if (node.nodeType !== 1) return '';
    const kids = () => [...node.childNodes].map((n) => block(n, ctx)).filter(Boolean).join('\n\n');
    switch (node.tagName) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        // Shift down two levels: the document already uses # and ## for structure.
        const level = Math.min(6, Number(node.tagName[1]) + 2);
        return `${'#'.repeat(level)} ${inline(node, ctx).trim()}`;
      }
      case 'P': {
        const only = node.children.length === 1 && !node.textContent.trim() && EMBED.test(node.children[0].tagName);
        if (only) return `> ${embedNote(node.children[0])}`;
        const t = inline(node, ctx).trim();
        return t || '';
      }
      case 'UL': case 'OL': return listBlock(node, ctx, 0);
      case 'TABLE': return tableBlock(node, ctx);
      case 'BLOCKQUOTE': return inline(node, ctx).trim().split('\n').map((l) => `> ${l}`).join('\n');
      case 'PRE': return '```\n' + node.textContent.replace(/\s+$/, '') + '\n```';
      case 'HR': return '---';
      case 'IFRAME': case 'VIDEO': case 'AUDIO': case 'EMBED': case 'OBJECT':
        return `> ${embedNote(node)}`;
      case 'SCRIPT': case 'STYLE': return '';
      default: {
        // A container: recurse if it holds blocks, otherwise treat it as inline.
        const hasBlocks = [...node.children].some((c) =>
          /^(P|DIV|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|IFRAME|SECTION|ARTICLE)$/.test(c.tagName));
        if (hasBlocks) return kids();
        const t = inline(node, ctx).trim();
        return t || '';
      }
    }
  }

  function htmlToMarkdown(html, base) {
    if (!html || !String(html).trim()) return '_(empty)_';
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    const out = [...doc.body.childNodes].map((n) => block(n, { base })).filter(Boolean).join('\n\n');
    return out.replace(/\n{3,}/g, '\n\n').trim() || '_(empty)_';
  }

  window.CCC_Export = { htmlToMarkdown };
})();
