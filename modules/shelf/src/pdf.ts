import { inflateSync } from "node:zlib";

export const SAMPLE_PDF_TEXT = "Put materials in. Take results out. The original file is not modified.";

export function createExtractablePdf(text = SAMPLE_PDF_TEXT): Buffer {
  const escaped = escapePdfLiteral(text);
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const startxref = Buffer.byteLength(out);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  out += `${xref}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export function extractPdfSelectableText(bytes: Uint8Array): string {
  const source = Buffer.from(bytes).toString("latin1");
  const pieces: string[] = [];
  const pattern = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of source.matchAll(pattern)) {
    const dict = match[1] ?? "";
    let data = Buffer.from(match[2] ?? "", "latin1");
    if (/\/FlateDecode/.test(dict)) {
      try {
        data = inflateSync(data);
      } catch {
        continue;
      }
    }
    const content = data.toString("latin1");
    for (const token of content.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
      pieces.push(unescapePdfString(unwrapLiteral(token[0] ?? "")));
    }
    for (const array of content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      for (const part of (array[1] ?? "").matchAll(/\((?:\\.|[^\\)])*\)/g)) {
        pieces.push(unescapePdfString(unwrapLiteral(part[0] ?? "")));
      }
    }
  }
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

function unwrapLiteral(token: string): string {
  const start = token.indexOf("(");
  const end = token.lastIndexOf(")");
  if (start < 0 || end <= start) return "";
  return token.slice(start + 1, end);
}

function escapePdfLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function unescapePdfString(value: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (ch !== "\\") {
      bytes.push(ch.charCodeAt(0) & 0xff);
      continue;
    }
    const next = value[index + 1] ?? "";
    if (next >= "0" && next <= "7") {
      let octal = next;
      index += 1;
      while (octal.length < 3 && index + 1 < value.length && value[index + 1]! >= "0" && value[index + 1]! <= "7") {
        index += 1;
        octal += value[index];
      }
      bytes.push(Number.parseInt(octal, 8) & 0xff);
      continue;
    }
    index += 1;
    if (next === "n") bytes.push(0x0a);
    else if (next === "r") bytes.push(0x0d);
    else if (next === "t") bytes.push(0x09);
    else bytes.push(next.charCodeAt(0) & 0xff);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const chars: string[] = [];
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      const hi = bytes[index];
      const lo = bytes[index + 1];
      if (hi == null || lo == null) break;
      chars.push(String.fromCharCode((hi << 8) | lo));
    }
    return chars.join("");
  }
  return Buffer.from(bytes).toString("latin1");
}
