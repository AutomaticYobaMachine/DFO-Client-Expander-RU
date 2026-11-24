'use strict';
// A small, dependency-free Word (.docx) writer and reader for the item-description registry: WordprocessingML parts
// zipped with fixed timestamps, so the same tables always give the same document. readZip reads it back (stored or
// deflated entries) so a test can compare the committed file with a fresh build part by part.
const zlib = require('node:zlib');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;   // 1980-01-01 00:00: a build never changes the bytes

/** A ZIP of [name, Buffer] entries, deflated, in the order given. */
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8'), raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const packed = zlib.deflateRawSync(raw, { level: 9 }), crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(DOS_TIME, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** The entries of a ZIP as a Map of name to Buffer (stored or deflated). */
function readZip(buf) {
  const out = new Map();
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30), comment = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.set(name, method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data));
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** A run: { text, bold, italic, mono, color (hex), size (half-points) }. */
function run(r) {
  if (typeof r === 'string') r = { text: r };
  const props = [r.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '', r.bold ? '<w:b/>' : '', r.italic ? '<w:i/>' : '',
    r.color ? `<w:color w:val="${r.color}"/>` : '', r.size ? `<w:sz w:val="${r.size}"/><w:szCs w:val="${r.size}"/>` : ''].join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(r.text)}</w:t></w:r>`;
}
/** A paragraph of runs: { style, keepNext, spacingAfter, align }. */
function para(runs, o = {}) {
  const props = [o.style ? `<w:pStyle w:val="${o.style}"/>` : '', o.keepNext ? '<w:keepNext/>' : '',
    o.spacingAfter != null ? `<w:spacing w:before="0" w:after="${o.spacingAfter}"/>` : '', o.align ? `<w:jc w:val="${o.align}"/>` : ''].join('');
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${(Array.isArray(runs) ? runs : [runs]).map(run).join('')}</w:p>`;
}
/** A table: widths in twentieths of a point; rows of { header, band, cells: [[paragraph xml...]] } or { band: text }. */
function table(widths, rows) {
  const total = widths.reduce((a, b) => a + b, 0);
  const border = '<w:top w:val="single" w:sz="4" w:space="0" w:color="C9CDD3"/><w:left w:val="single" w:sz="4" w:space="0" w:color="C9CDD3"/>'
    + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="C9CDD3"/><w:right w:val="single" w:sz="4" w:space="0" w:color="C9CDD3"/>'
    + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="C9CDD3"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="C9CDD3"/>';
  const cell = (width, paragraphs, shade, span) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span ? `<w:gridSpan w:val="${span}"/>` : ''}`
    + `${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}</w:tcPr>${paragraphs.join('') || '<w:p/>'}</w:tc>`;
  const body = rows.map(r => {
    if (typeof r.band === 'string') {
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(total, [para({ text: r.band, bold: true, color: '7D6125', size: 18 }, { keepNext: true, spacingAfter: 0 })], 'EFE9DC', widths.length)}</w:tr>`;
    }
    return `<w:tr><w:trPr><w:cantSplit/>${r.header ? '<w:tblHeader/>' : ''}</w:trPr>${r.cells.map((c, i) => cell(widths[i], c, r.header ? 'E4E7EB' : null)).join('')}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/>`
    + '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
    + `</w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${body}</w:tbl>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="60" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light" w:cs="Calibri Light"/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="1B1F24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="320" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light" w:cs="Calibri Light"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="2F5F8A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="1B1F24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Cell"><w:name w:val="Table text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

/** The whole document: body XML (paragraphs and tables), landscape A4 with narrow margins, a page number footer. */
function docx(bodyXml, { title, subject }) {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${bodyXml}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>`
    + '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="5D6470"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${xmlEsc(title)} · </w:t></w:r>`
    + '<w:r><w:rPr><w:color w:val="5D6470"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="5D6470"/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
    + '<w:r><w:rPr><w:color w:val="5D6470"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="5D6470"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r>'
    + '<w:r><w:rPr><w:color w:val="5D6470"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
  const entries = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
      + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(title)}</dc:title><dc:subject>${xmlEsc(subject || '')}</dc:subject><dc:creator>DFO-Client-Expander-RU</dc:creator><dc:language>ru-RU</dc:language></cp:coreProperties>`],
    ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>DFO-Client-Expander-RU tools/build-item-text-pages.cjs</Application></Properties>`],
    ['word/document.xml', document],
    ['word/styles.xml', STYLES],
    ['word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${W}><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
    ['word/footer1.xml', footer],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
      + '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'],
  ];
  return { entries, buffer: zip(entries) };
}

module.exports = { zip, readZip, crc32, run, para, table, docx, xmlEsc };
