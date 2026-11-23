// The releases a golden Home holds (specs/upgrade-continuity/golden-replay-design.md §6). Every project library and every Home's runtime library keeps a
// row per built-in plugin with its Manifest and its code, and those two fields were nearly all of the dump. A dump keeps a digest where each one was, one
// compressed copy per digest sits under files/, and a restore writes them back: the expanded dump is the original dump, byte for byte.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { goldenFailure } from "./failure.mjs";

const ROW = 'INSERT INTO "plugin_runtime_release_artifacts"(';
const WHERE = "plugin_runtime_release_artifacts";
const SOURCE_FIELD = '"module_source":"', MANIFEST_FIELD = '"manifest":';
const SOURCE_DIGEST = /"module_source":"sha256:([0-9a-f]{64})"/u, MANIFEST_DIGEST = /"manifest":"sha256:([0-9a-f]{64})"/u;
export const MODULE_SOURCES_DIRECTORY = "files/module-sources";
export const RELEASE_MANIFESTS_DIRECTORY = "files/release-manifests";

const sha256 = text => createHash("sha256").update(text).digest("hex");
const shapeFailure = () => goldenFailure("golden.release_payload_shape", WHERE);

/** Where the JSON string starting at `from` closes. A regular expression over one of these strings overflows the stack. */
function closingQuote(text, from) {
  for (let at = from; at < text.length; at++) {
    if (text[at] === "\\") at++;
    else if (text[at] === '"') return at;
  }
  throw shapeFailure();
}

/** A field of the JSON inside the row's SQL string: SQL doubles its quotes, JSON escapes the rest. */
const fromSql = text => text.replaceAll("''", "'");
const toSql = text => text.replaceAll("'", "''");

/** Where the JSON object starting at `from` (its `{`) ends, just after its `}`; strings may hold braces. */
function objectEnd(text, from) {
  if (text[from] !== "{") throw shapeFailure();
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const char = text[at];
    if (char === '"') at = closingQuote(text, at + 1);
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return at + 1;
  }
  throw shapeFailure();
}

/**
 * One row: the row writes its Manifest just before its code. A built-in plugin's row has no code (the Host's build holds
 * it), so its Manifest closes the row's JSON and only the Manifest is kept by digest.
 */
function strippedRow(line, { sources, manifests }) {
  const manifestField = line.indexOf(MANIFEST_FIELD);
  if (manifestField < 0) throw shapeFailure();
  const manifestStart = manifestField + MANIFEST_FIELD.length, manifestEnd = objectEnd(line, manifestStart);
  const manifest = fromSql(line.slice(manifestStart, manifestEnd)), manifestDigest = sha256(manifest);
  const withManifest = `${line.slice(0, manifestStart)}"sha256:${manifestDigest}"`;
  if (line[manifestEnd] === "}") {
    // Code anywhere else in the row would stay written out in full.
    if (line.includes(SOURCE_FIELD)) throw shapeFailure();
    manifests.set(manifestDigest, manifest);
    return withManifest + line.slice(manifestEnd);
  }
  if (!line.startsWith("," + SOURCE_FIELD, manifestEnd)) throw shapeFailure();
  const sourceStart = manifestEnd + 1 + SOURCE_FIELD.length, sourceEnd = closingQuote(line, sourceStart);
  const source = JSON.parse(`"${fromSql(line.slice(sourceStart, sourceEnd))}"`), sourceDigest = sha256(source);
  manifests.set(manifestDigest, manifest);
  sources.set(sourceDigest, source);
  return `${withManifest}${line.slice(manifestEnd, sourceStart)}sha256:${sourceDigest}${line.slice(sourceEnd)}`;
}

/** The dump's rows with digests in place of the Manifest and the code, which land in `payloads` by digest, once however many rows hold them. */
export function withoutReleasePayloads(sql, payloads) {
  return sql.split("\n").map(line => line.startsWith(ROW) ? strippedRow(line, payloads) : line).join("\n");
}

/** The reverse. `read` gives the text of a digest in a directory. Replacement functions: code is full of `$&`, which a replacement string would interpret. */
export function withReleasePayloads(sql, read) {
  return sql.split("\n").map(line => {
    if (!line.startsWith(ROW)) return line;
    const manifest = MANIFEST_DIGEST.exec(line), source = SOURCE_DIGEST.exec(line);
    // A row holds code by digest, or none at all (a built-in plugin's): never code written out in full.
    if (!manifest || (!source && line.includes(SOURCE_FIELD))) throw shapeFailure();
    const restored = line.replace(MANIFEST_DIGEST, () => `${MANIFEST_FIELD}${toSql(read(RELEASE_MANIFESTS_DIRECTORY, manifest[1]))}`);
    return source ? restored.replace(SOURCE_DIGEST, () => `"module_source":${toSql(JSON.stringify(read(MODULE_SOURCES_DIRECTORY, source[1])))}`) : restored;
  }).join("\n");
}

/** One file per digest. The largest window, because a plugin's bundle holds the same libraries many times over. */
export function writeReleasePayloads(out, directory, texts) {
  return [...texts].sort(([a], [b]) => a < b ? -1 : 1).map(([digest, text]) => {
    const payload = `${directory}/${digest}.br`, file = path.join(out, payload);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, brotliCompressSync(text, { params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY, [constants.BROTLI_PARAM_LGWIN]: constants.BROTLI_MAX_WINDOW_BITS } }));
    return { digest, payload, bytes: Buffer.byteLength(text) };
  });
}

export const isReleasePayload = file => file.startsWith(`${MODULE_SOURCES_DIRECTORY}/`) || file.startsWith(`${RELEASE_MANIFESTS_DIRECTORY}/`);
export const expandedReleasePayload = bytes => brotliDecompressSync(bytes);

/** What a restore reads a digest with: checked against its name, a copy that does not match is a damaged golden, and each file read once. */
export function releasePayloadReader(golden) {
  const read = new Map();
  return (directory, digest) => {
    const payload = `${directory}/${digest}.br`;
    if (read.has(payload)) return read.get(payload);
    let text;
    try { text = expandedReleasePayload(readFileSync(path.join(golden, payload))).toString("utf8"); }
    catch { throw goldenFailure("golden.payload_digest_mismatch", payload); }
    if (sha256(text) !== digest) throw goldenFailure("golden.payload_digest_mismatch", payload);
    read.set(payload, text);
    return text;
  };
}
