import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";

// The smallest Office, OpenDocument, EPUB and RTF files the import's reader accepts (specs/project-knowledge PMAT-47), built here
// so a test needs no office suite; and a blank PNG, which has no text to recognize.
const { zipSync } = createRequire(new URL("../../apps/local-host/package.json", import.meta.url))("fflate") as { zipSync(entries: Record<string, Uint8Array>): Uint8Array };
const b = (text: string) => Buffer.from(text);
const OOXML_TYPES = (parts: Record<string, string>) => b(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>${
  Object.entries(parts).map(([part, type]) => `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`).join("")}</Types>`);
const RELS = (type: string, target: string) => b(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`);

/** A workbook with one sheet: a header row and the given rows. */
export function xlsx(rows: string[][]): Uint8Array {
  const cell = (value: string, at: string) => `<c r="${at}" t="inlineStr"><is><t>${value}</t></is></c>`;
  const sheet = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, column) => cell(value, `${String.fromCharCode(65 + column)}${index + 1}`)).join("")}</row>`).join("");
  return zipSync({
    "[Content_Types].xml": OOXML_TYPES({ "/xl/workbook.xml": "spreadsheetml.sheet.main+xml", "/xl/worksheets/sheet1.xml": "spreadsheetml.worksheet+xml" }),
    "xl/workbook.xml": b('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": RELS("worksheet", "worksheets/sheet1.xml"),
    "xl/worksheets/sheet1.xml": b(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`),
  });
}

/** A deck with one slide holding one line. */
export function pptx(line: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": OOXML_TYPES({ "/ppt/presentation.xml": "presentationml.presentation.main+xml", "/ppt/slides/slide1.xml": "presentationml.slide+xml" }),
    "ppt/presentation.xml": b('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>'),
    "ppt/_rels/presentation.xml.rels": RELS("slide", "slides/slide1.xml"),
    "ppt/slides/slide1.xml": b(`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${line}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`),
  });
}

/** An OpenDocument text with a heading and a paragraph. */
export function odt(heading: string, paragraph: string): Uint8Array {
  return zipSync({
    mimetype: b("application/vnd.oasis.opendocument.text"),
    "META-INF/manifest.xml": b('<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>'),
    "content.xml": b(`<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h text:outline-level="1">${heading}</text:h><text:p>${paragraph}</text:p></office:text></office:body></office:document-content>`),
  });
}

/** An EPUB with one chapter: a heading and a paragraph. */
export function epub(heading: string, paragraph: string): Uint8Array {
  return zipSync({
    mimetype: b("application/epub+zip"),
    "META-INF/container.xml": b('<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    "OEBPS/content.opf": b('<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Book</dc:title></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>'),
    "OEBPS/c1.xhtml": b(`<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>${heading}</h1><p>${paragraph}</p></body></html>`),
  });
}

/** An RTF with a bold line and a plain one; characters past ASCII as RTF's \uN escapes. */
export function rtf(bold: string, plain: string): Uint8Array {
  const escaped = (text: string) => [...text].map(char => char.charCodeAt(0) > 127 ? `\\u${(char.charCodeAt(0) << 16) >> 16}?` : char).join("");
  return b(`{\\rtf1\\ansi {\\b ${escaped(bold)}}\\par ${escaped(plain)}\\par}`);
}

/** An 8×8 white PNG. */
export function blankPng(): Uint8Array {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (bytes: Buffer) => { let x = 0xffffffff; for (const byte of bytes) x = table[(x ^ byte) & 0xff]! ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const typed = Buffer.concat([b(type), data]), length = Buffer.alloc(4), sum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); sum.writeUInt32BE(crc(typed));
    return Buffer.concat([length, typed, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(8, 0); header.writeUInt32BE(8, 4); header[8] = 8;
  const rows = Buffer.alloc(8 * 9, 255).map((value, index) => index % 9 === 0 ? 0 : value);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
