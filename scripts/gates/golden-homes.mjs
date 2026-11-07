// Gate: the golden Homes still cover the Home and still fit (specs/upgrade-continuity/golden-replay-design.md §5, §6, UPG2-04). No baseline: it starts at zero.
//
// Coverage. Every path docs/system/HOME-DATA.md says must be backed up (§3, §5, §6: the 备份 cell starts with 必备份; §3.3 says all of its libraries are), and what the
// design adds to that (DESIGN_REQUIRES), is in the latest golden's manifest, in either of its Homes. A new row in that document needs the golden in the same pull
// request. A path no golden can hold today goes in tooling/gates/golden-coverage.json `uncovered`, with its reason, and that list is checked both ways: a listed path
// that is no longer required, or that the golden now holds, fails, so it cannot go stale.
//
// Write cases. Every library of §3 that must be backed up has its minimal write under tests/golden-writes/, or a reason it has none (§4 step 6). The file names are
// not the owner names of that document (a library's owner is often 宿主, and one owner's tables sit in the project library), so the same file maps each library to its
// cases, and every case file is either mapped or listed under `other_writes` with what it writes.
//
// Size. The bytes of tests/fixtures/golden-homes/ in the working tree stay within 50 MB. Over it, the oldest golden moves to a release attachment, whatever its age
// (user 2026-11-08), and the failure names it. It looks at tracked files only, like every gate here.
//
// Reads text only (one manifest, one document, one list): no install, no build. What it cannot see: whether a covered library holds a row, and whether a reader finds
// what is in a file. The replay answers those.
import { GOLDEN_HOMES_DIRECTORY, versionsNewestLast } from "../golden/versions.mjs";

export const GOLDEN_BYTES_LIMIT = 50 * 1024 * 1024;
const DATA = "docs/system/HOME-DATA.md", COVERAGE = "tooling/gates/golden-coverage.json", WRITES = "tests/golden-writes/";
const MINIMUM_REASON = 10;
/** Not in the document's 必备份 cells, or kept by the snapshot apart from them, and still what a golden is for (§2 items 3, 6-8). */
const DESIGN_REQUIRES = ["storage-space.json", "plugin-packages/", "spaces/", "feed/secrets.json", "config/installation.json", "agent-runtime/storage.key"];
const MUST_BACK_UP = /^必备份/u, SECTIONS = /^#{2,3} ([356])[.]/u, ALL_MUST = /^#{2,3} 3\.3 /u, PATH_COLUMN = "路径", BACKUP_COLUMN = "备份";

const cellsOf = line => line.trim().replace(/^\||\|$/gu, "").split(" | ").map(cell => cell.trim());
const pathsIn = cell => [...cell.matchAll(/`([^`]+)`/gu)].map(match => match[1]).filter(text => !text.startsWith("-"));

/** The rows that must be backed up: their paths, and whether they are one of the libraries of §3. */
export function requiredRows(text) {
  const rows = [];
  let section, all = false, header;
  for (const line of text.split("\n")) {
    if (/^#{2,3} /u.test(line)) { section = SECTIONS.exec(line)?.[1]; all = ALL_MUST.test(line); header = undefined; continue; }
    if (!section || !line.startsWith("|")) continue;
    const cells = cellsOf(line);
    if (cells[0] === PATH_COLUMN) { header = cells; continue; }
    if (!header || /^-+$/u.test(cells[0])) continue;
    const backup = header.indexOf(BACKUP_COLUMN);
    if (all || (backup >= 0 && MUST_BACK_UP.test(cells[backup] ?? ""))) rows.push({ paths: pathsIn(cells[0]), library: section === "3" });
  }
  return rows;
}

/** A path of that document as a matcher: `<x>` is one path segment, `**` anything, `{a,b}` either, and a path ending in `/` is everything under it. */
export function pathMatcher(pattern) {
  const body = pattern.replace(/\/$/u, "").replace(/[.+?^$()|[\]\\]/gu, "\\$&").replace(/<[^>]+>/gu, "[^/]+").replace(/\*\*/gu, "\u0000").replace(/\*/gu, "[^/]*").replace(/\u0000/gu, ".*")
    .replace(/\{([^}]+)\}/gu, (_, options) => `(?:${options.split(",").join("|")})`);
  const expression = new RegExp(`^${body}(?:/.*)?$`, "u");
  return held => expression.test(held);
}

/** Everything a manifest holds, in its own Home's paths as well as the golden's: `spaces/<id>/x` is also `x` of the account Home. */
function heldPaths(manifest) {
  const accounts = (manifest.homes ?? []).map(home => home.path).filter(Boolean);
  return [...manifest.stores ?? [], ...manifest.files ?? [], ...manifest.directories ?? []].flatMap(({ path }) => {
    const home = accounts.find(prefix => path.startsWith(`${prefix}/`));
    return home ? [path, path.slice(home.length + 1)] : [path];
  });
}

const reasonProblem = (where, reason) => typeof reason === "string" && reason.trim().length >= MINIMUM_REASON ? [] : [`${COVERAGE}: ${where} needs a reason that says something`];

function coverageProblems(rows, held, uncovered, version) {
  const required = new Set([...DESIGN_REQUIRES, ...rows.flatMap(row => row.paths)]), problems = [], listed = new Set();
  for (const { path: listedPath, reason } of uncovered) {
    listed.add(listedPath);
    problems.push(...reasonProblem(`uncovered ${listedPath}`, reason));
    if (!required.has(listedPath)) problems.push(`${COVERAGE}: uncovered ${listedPath} is not a path that must be backed up any more; remove it`);
    else if (held.some(pathMatcher(listedPath))) problems.push(`${COVERAGE}: uncovered ${listedPath} is in golden ${version} now; remove it`);
  }
  for (const pattern of required) if (!listed.has(pattern) && !held.some(pathMatcher(pattern))) {
    problems.push(`golden coverage (UPG2-04): ${pattern} must be backed up (${DATA}) and is not in golden ${version}. Generate a golden that holds it, or list it in ${COVERAGE} with the reason`);
  }
  return problems;
}

function writeProblems(rows, files, writes, otherWrites) {
  const libraries = new Set(rows.filter(row => row.library).flatMap(row => row.paths)), cases = new Set(files.filter(file => file.startsWith(WRITES) && file.endsWith(".ts")).map(file => file.slice(WRITES.length)));
  const problems = [], mapped = new Set();
  for (const library of libraries) if (!writes[library]) problems.push(`golden write cases: ${library} must be backed up and ${COVERAGE} does not say which case in ${WRITES} writes it, or why none does`);
  for (const [library, entry] of Object.entries(writes)) {
    if (!libraries.has(library)) problems.push(`${COVERAGE}: writes has ${library}, which is not a library that must be backed up; remove it`);
    if (entry.none !== undefined) problems.push(...reasonProblem(`writes ${library}`, entry.none));
    else if (!entry.cases?.length) problems.push(`${COVERAGE}: writes ${library} names no case and gives no reason`);
    for (const name of entry.cases ?? []) {
      mapped.add(name);
      if (!cases.has(name)) problems.push(`${COVERAGE}: writes ${library} names ${WRITES}${name}, which does not exist`);
    }
  }
  for (const [name, reason] of Object.entries(otherWrites)) {
    problems.push(...reasonProblem(`other_writes ${name}`, reason));
    if (!cases.has(name)) problems.push(`${COVERAGE}: other_writes names ${WRITES}${name}, which does not exist`);
    if (mapped.has(name)) problems.push(`${COVERAGE}: ${name} is both mapped to a library and under other_writes`);
  }
  for (const name of cases) if (!mapped.has(name) && otherWrites[name] === undefined) problems.push(`golden write cases: ${WRITES}${name} is neither mapped to a library in ${COVERAGE} nor under other_writes`);
  return problems;
}

/** `tree`: { files (tracked), read(file) gives its text or null, size(file) gives its bytes }. */
export function goldenHomeProblems({ files, read, size }) {
  const data = read(DATA);
  if (data === null) return [];
  const prefix = `${GOLDEN_HOMES_DIRECTORY}/`, held = new Map();
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const [name, ...rest] = file.slice(prefix.length).split("/");
    if (!rest.length) continue;
    if (!held.has(name)) held.set(name, []);
    held.get(name).push(file);
  }
  if (!held.size) return [`golden coverage (UPG2-04): ${GOLDEN_HOMES_DIRECTORY} holds no golden Home`];
  const ordered = versionsNewestLast([...held.keys()]), latest = ordered.at(-1), problems = [];
  const bytes = [...held.values()].flat().reduce((total, file) => total + size(file), 0);
  if (bytes > GOLDEN_BYTES_LIMIT) problems.push(`golden size: ${GOLDEN_HOMES_DIRECTORY} is ${bytes} bytes, over ${GOLDEN_BYTES_LIMIT}. Move the oldest, ${ordered[0]}, to a release attachment (specs/upgrade-continuity/golden-replay-design.md §6), whatever its age`);
  let manifest, coverage;
  try { manifest = JSON.parse(read(`${prefix}${latest}/manifest.json`)); }
  catch { return [...problems, `golden coverage (UPG2-04): ${prefix}${latest}/manifest.json cannot be read`]; }
  try { coverage = JSON.parse(read(COVERAGE)); }
  catch { return [...problems, `${COVERAGE} cannot be read`]; }
  // A golden made where the sandbox could not run, or without saying which Node ran, is not one to keep (§5, generated by the locked Node).
  for (const field of ["third_party", "home_library", "node"]) if (typeof manifest[field] !== "string") problems.push(`golden ${latest}: its manifest has no ${field}; generate it with the signed samples, on the Node .nvmrc locks`);
  const rows = requiredRows(data);
  if (!rows.length) return [...problems, `golden coverage (UPG2-04): ${DATA} no longer has rows this gate can read, so it covers nothing`];
  return [...problems, ...coverageProblems(rows, heldPaths(manifest), coverage.uncovered ?? [], latest), ...writeProblems(rows, files, coverage.writes ?? {}, coverage.other_writes ?? {})];
}
