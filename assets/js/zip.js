/* File: assets/js/zip.js
 * Minimal store-only ZIP writer, shared by the .docx export and file downloads.
 *
 * No compression (method 0). That is legal in both a .docx and a plain archive,
 * and it avoids vendoring a deflate implementation for little gain: the .docx
 * XML parts are small, and Canvas files are mostly images and PDFs that are
 * already compressed.
 */
(function () {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const enc = new TextEncoder();

  /**
   * files: [{ name, bytes: Uint8Array }] — or { text } which is encoded as UTF-8.
   * Returns a Blob of the given mime type.
   */
  function makeZip(files, mime = 'application/zip') {
    const chunks = [];
    const central = [];
    let offset = 0;
    const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
    const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.bytes instanceof Uint8Array ? f.bytes : enc.encode(f.text ?? '');
      const crc = crc32(data);
      // Local file header. Method 0 = stored; fixed DOS timestamp for reproducibility.
      const local = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length),
        ...u16(nameBytes.length), ...u16(0)];
      chunks.push(new Uint8Array(local), nameBytes, data);
      central.push({ name: nameBytes, crc, size: data.length, offset });
      offset += local.length + nameBytes.length + data.length;
    }

    const dir = [];
    for (const e of central) {
      dir.push(...[0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0x21), ...u32(e.crc), ...u32(e.size), ...u32(e.size),
        ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
        ...u32(e.offset)], ...e.name);
    }
    const dirBytes = new Uint8Array(dir);
    const eocd = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0),
      ...u16(central.length), ...u16(central.length), ...u32(dirBytes.length), ...u32(offset), ...u16(0)]);
    return new Blob([...chunks, dirBytes, eocd], { type: mime });
  }

  // Two files in one archive cannot share a name.
  function uniqueName(name, taken) {
    if (!taken.has(name)) { taken.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let i = 2;
    while (taken.has(`${stem} (${i})${ext}`)) i++;
    const out = `${stem} (${i})${ext}`;
    taken.add(out);
    return out;
  }

  window.CCC_Zip = { makeZip, crc32, uniqueName };
})();
