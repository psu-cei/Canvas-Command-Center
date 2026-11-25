/* File: assets/js/docx-export.js
 * Builds a real .docx from the Markdown that content-export.js produces.
 *
 * WHY HAND-ROLLED
 *   A .docx is a ZIP of XML parts. Writing one needs ~250 lines; the usual
 *   library is ~500KB of vendored third-party code in a repo with no build
 *   step. Google Docs, Word and Pages all open what this produces.
 *
 * WHY FROM MARKDOWN
 *   The .md export is already the reviewed artifact. Rendering the .docx from
 *   the same text means the two downloads can never disagree.
 *
 * Supported: headings, paragraphs, bullet and numbered lists, block quotes,
 * fenced code, horizontal rules, tables, and inline bold / italic / code /
 * links. Anything else degrades to plain text rather than breaking the file.
 */
(function () {
  const enc = new TextEncoder();

  // ZIP writing lives in zip.js, shared with the file-download feature.
  const zip = (files) => window.CCC_Zip.makeZip(files,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  // ---------------- XML helpers ----------------
  const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  // xml:space="preserve" keeps the spaces between inline runs from collapsing.
  const run = (text, opts = {}) => {
    const props = [opts.b ? '<w:b/>' : '', opts.i ? '<w:i/>' : '',
      opts.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '',
      opts.link ? '<w:rStyle w:val="Hyperlink"/>' : ''].join('');
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
  };

  // ---------------- inline Markdown -> runs ----------------
  function inlineRuns(text, rels) {
    const out = [];
    // Order matters: links first, then code, bold, italic.
    const re = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
    let last = 0, m;
    const plain = (s) => { if (s) out.push(run(s.replace(/\\([\\`*_[\]])/g, '$1'))); };
    while ((m = re.exec(text))) {
      plain(text.slice(last, m.index));
      if (m[1] !== undefined) {
        // Images are not embedded in the .docx; link to them so the reviewer can look.
        const id = rels.add(m[2]);
        out.push(`<w:hyperlink r:id="${id}">${run(`[Image${m[1] ? `: ${m[1]}` : ''}]`, { link: true, i: true })}</w:hyperlink>`);
      } else if (m[3] !== undefined) {
        const id = rels.add(m[4]);
        out.push(`<w:hyperlink r:id="${id}">${run(m[3], { link: true })}</w:hyperlink>`);
      } else if (m[5] !== undefined) out.push(run(m[5], { code: true }));
      else if (m[6] !== undefined) out.push(run(m[6], { b: true }));
      else out.push(run(m[7], { i: true }));
      last = re.lastIndex;
    }
    plain(text.slice(last));
    return out.join('') || run('');
  }

  const para = (runs, style, extra = '') =>
    `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${runs}</w:p>`;

  // ---------------- block Markdown -> WordprocessingML ----------------
  function body(markdown, rels) {
    const lines = markdown.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push(para(inlineRuns(h[2], rels), `Heading${h[1].length}`)); continue; }

      if (/^(---|\*\*\*|___)\s*$/.test(line)) {
        out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr></w:pPr></w:p>');
        continue;
      }

      if (line.startsWith('```')) {
        const buf = [];
        while (++i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i]);
        for (const l of buf) out.push(para(run(l, { code: true }), 'CodeBlock'));
        continue;
      }

      if (line.startsWith('>')) {
        const buf = [];
        while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
        i--;
        out.push(para(inlineRuns(buf.join(' '), rels), 'Quote'));
        continue;
      }

      // Table: a header row followed by a |---|---| separator.
      if (line.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
        const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const rows = [cells(line)];
        i += 2;
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
        i--;
        const width = Math.max(...rows.map((r) => r.length));
        const tr = (cs, head) => `<w:tr>${Array.from({ length: width }, (_, n) =>
          `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(
            inlineRuns((cs[n] || '').replace(/\\\|/g, '|'), rels), head ? 'TableHead' : '')}</w:tc>`).join('')}</w:tr>`;
        out.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${
          ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) =>
            `<w:${s} w:val="single" w:sz="4" w:color="CCCCCC"/>`).join('')
        }</w:tblBorders></w:tblPr>${tr(rows[0], true)}${rows.slice(1).map((r) => tr(r, false)).join('')}</w:tbl>`);
        out.push(para(run(''), ''));
        continue;
      }

      const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (li) {
        const level = Math.min(4, Math.floor(li[1].length / 2));
        const numId = /^\d/.test(li[2]) ? 2 : 1;
        out.push(para(inlineRuns(li[3], rels), 'ListParagraph',
          `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`));
        continue;
      }

      out.push(para(inlineRuns(line, rels), ''));
    }
    return out.join('');
  }

  // ---------------- parts ----------------
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
${[1, 2, 3, 4, 5, 6].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${n - 1}"/><w:spacing w:before="${280 - n * 20}" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="${Math.max(22, 40 - n * 3)}"/></w:rPr></w:style>`).join('')}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="480"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BBBBBB"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/><w:shd w:val="clear" w:fill="F4F4F4"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableHead"><w:name w:val="Table Head"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;

  const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${[1, 2].map((id) => `<w:abstractNum w:abstractNumId="${id}">${
  [0, 1, 2, 3, 4].map((lvl) => `<w:lvl w:ilvl="${lvl}"><w:start w:val="1"/><w:numFmt w:val="${id === 1 ? 'bullet' : 'decimal'}"/><w:lvlText w:val="${id === 1 ? '&#8226;' : `%${lvl + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (lvl + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join('')
}</w:abstractNum>`).join('')}
${[1, 2].map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>`).join('')}
</w:numbering>`;

  function fromMarkdown(markdown) {
    const links = [];
    const rels = { add(target) { links.push(target); return `hl${links.length}`; } };
    const content = body(markdown, rels);

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${content}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;

    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/>
<Relationship Id="rIdNum" Type="${R}/numbering" Target="numbering.xml"/>
${links.map((t, n) => `<Relationship Id="hl${n + 1}" Type="${R}/hyperlink" Target="${x(t)}" TargetMode="External"/>`).join('')}
</Relationships>`;

    return zip([
      { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>` },
      { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>
</Relationships>` },
      { name: 'word/document.xml', text: document },
      { name: 'word/_rels/document.xml.rels', text: docRels },
      { name: 'word/styles.xml', text: STYLES },
      { name: 'word/numbering.xml', text: NUMBERING },
    ]);
  }

  window.CCC_Docx = { fromMarkdown };
})();
