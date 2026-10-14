import { transformSync } from "esbuild";

/** Compact cached browser text, keeping public globals and legal notices. Already smaller assets stay unchanged. */
export function compactServedText(source: string | Buffer, contentType: string): string | Buffer {
  const loader = contentType.startsWith("text/javascript") ? "js" : contentType.startsWith("text/css") ? "css" : null;
  if (!loader) return source;
  const compact = transformSync(source.toString(), { loader, minifyWhitespace: true, minifyIdentifiers: loader === "js", legalComments: "inline", charset: "utf8" }).code;
  return Buffer.byteLength(compact) < Buffer.byteLength(source) ? compact : source;
}
