// The code of plugin releases in a golden Home (specs/upgrade-continuity/golden-replay-design.md §6). Every project library and every Home's runtime
// library keeps a copy of every built-in plugin's code, so that one field was 40.8 of the first 54.2 MB. A dump keeps a digest where the code was,
// one compressed copy per digest sits under files/, and a restore writes the code back: the expanded dump is the original dump, byte for byte.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { goldenFailure } from "./failure.mjs";

const ROW = 'INSERT INTO "plugin_runtime_release_artifacts"(';
const FIELD = '"module_source":"';
const DIGEST = /"module_source":"sha256:([0-9a-f]{64})"/u;
export const MODULE_SOURCES_DIRECTORY = "files/module-sources";

const sha256 = text => createHash("sha256").update(text).digest("hex");
const payloadOf = digest => `${MODULE_SOURCES_DIRECTORY}/${digest}.br`;

/** Where the JSON string starting at `from` closes. A regular expression over one of these strings overflows the stack. */
function closingQuote(text, from) {
  for (let at = from; at < text.length; at++) {
    if (text[at] === "\\") at++;
    else if (text[at] === '"') return at;
  }
  throw goldenFailure("golden.module_source_shape", "plugin_runtime_release_artifacts");
}

/** The dump's rows with a digest in place of the code. The code lands in `sources` by digest, once however many rows hold it. */
export function withoutModuleSources(sql, sources) {
  return sql.split("\n").map(line => {
    if (!line.startsWith(ROW)) return line;
    const opening = line.indexOf(FIELD);
    if (opening < 0) throw goldenFailure("golden.module_source_shape", "plugin_runtime_release_artifacts");
    const start = opening + FIELD.length, end = closingQuote(line, start);
    // The field is a JSON string inside a SQL string: SQL doubles its quotes, JSON escapes the rest.
    const source = JSON.parse(`"${line.slice(start, end).replaceAll("''", "'")}"`), digest = sha256(source);
    sources.set(digest, source);
    return `${line.slice(0, start)}sha256:${digest}${line.slice(end)}`;
  }).join("\n");
}

/** The reverse. `read` gives the code of a digest. */
export function withModuleSources(sql, read) {
  return sql.split("\n").map(line => {
    if (!line.startsWith(ROW)) return line;
    const found = DIGEST.exec(line);
    if (!found) throw goldenFailure("golden.module_source_shape", "plugin_runtime_release_artifacts");
    // A replacement function: code is full of `$&`, which a replacement string would interpret.
    return line.replace(DIGEST, () => `"module_source":${JSON.stringify(read(found[1])).replaceAll("'", "''")}`);
  }).join("\n");
}

/** One file per digest. The largest window, because a plugin's bundle holds the same libraries many times over. */
export function writeModuleSources(out, sources) {
  return [...sources].sort(([a], [b]) => a < b ? -1 : 1).map(([digest, source]) => {
    const file = path.join(out, payloadOf(digest));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY, [constants.BROTLI_PARAM_LGWIN]: constants.BROTLI_MAX_WINDOW_BITS } }));
    return { digest, payload: payloadOf(digest), bytes: Buffer.byteLength(source) };
  });
}

export const expandedModuleSource = bytes => brotliDecompressSync(bytes);

/** What a restore reads a digest with: checked against its name, a copy that does not match is a damaged golden, and each file read once. */
export function moduleSourceReader(directory) {
  const read = new Map();
  return digest => {
    if (read.has(digest)) return read.get(digest);
    let source;
    try { source = expandedModuleSource(readFileSync(path.join(directory, payloadOf(digest)))).toString("utf8"); }
    catch { throw goldenFailure("golden.payload_digest_mismatch", payloadOf(digest)); }
    if (sha256(source) !== digest) throw goldenFailure("golden.payload_digest_mismatch", payloadOf(digest));
    read.set(digest, source);
    return source;
  };
}
