#!/usr/bin/env node
// Secret scan (specs/repository-anti-corruption §4.18): looks for credentials in the lines a branch ADDS, so a key never
// reaches a pushed commit or a pull request. Lines that are already on the base are not rescanned. Every commit of the
// branch is read, not only the net change: a key added in one commit and removed in the next is still in the pushed
// history, so it still fails (rewrite the branch, and rotate the key).
//
//   node scripts/check-secrets.mjs                     commits since the merge base with origin/main (pnpm secrets:check)
//   node scripts/check-secrets.mjs --base <ref|sha>    another base (CI passes the PR base or the push's previous tip)
//   node scripts/check-secrets.mjs --head <ref|sha>    another head (default HEAD)
//   node scripts/check-secrets.mjs --all               every text line at the head (an audit of the whole tree)
//   node scripts/check-secrets.mjs --allowlist <file>  another allow-list (default tooling/gates/secret-allowlist.txt)
//
// SECRET_SCAN_BASE sets the default base; SECRET_SCAN_ROOT scans another repository (the tests use it).
// Exit 0: nothing found. Exit 1: findings (printed redacted: file, line, rule, a short preview, never the full value).
// Exit 2: the scan could not run (unknown ref, missing history, malformed allow-list).
//
// Allow-list (tooling/gates/secret-allowlist.txt): one entry per line, `<fixed string or /regex/flags>  # reason`.
// An entry matches the finding's value (the secret itself: the quoted value of an assignment, the whole match for a
// key shape). A fixed string must equal the value; a regex only has to match somewhere in it. Every entry needs a
// reason. Only values that are test data and already public on main belong there.
//
// What it does not do: read values that are not quoted (`password: hunter2hunter2` in YAML), look inside binary files,
// or know a secret that has no recognisable shape. It is a net for the common accidents, not a vault.
//
// The patch is read with the repository's own settings switched off where they change what a line looks like: no external
// diff driver, no textconv filter (a user's attributes file could otherwise rewrite the lines this reads), fixed a/ b/
// prefixes (diff.noprefix), and quotepath off. A path that git writes as a C-style quoted string in a header (a name with a
// quote, a backslash or a control character) is decoded; a header that cannot be decoded is scanned under its raw text, so
// no added line is ever dropped for the way its file is named.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const DEFAULT_ALLOWLIST = "tooling/gates/secret-allowlist.txt";

// A generic assignment: a name that ends in key/secret/password/token/credential (OPENAI_API_KEY, clientSecret, "password"),
// then `=`, `:` or `:=`, then a QUOTED value of 12 or more characters without spaces. Values that only point at a secret
// or stand in for one are not secrets. The name is not matched with a leading wildcard: that would be quadratic on a long
// base64 line.
// A key name needs a word in front that says it is the secret half (secretKey, private_key, aws_secret_access_key, clientKey,
// signing_key): a bare `key` is a map key, a cache key or a React key far more often than a credential. Token and secret
// names already end the same way (access_token, client_secret, authToken).
const NAME = String.raw`(?:api[_-]?key|(?:secret|private|access|client|auth|signing|encryption)[_-]?key|secret|passw(?:or)?d|token|credential)s?`;
// A type annotation between the name and the equals sign (`const apiKey: string = "…"`, `api_key: str = "…"`,
// `let secret: &'static str = "…"`): a short run of type characters, so the scan cannot run away on a long line.
const TYPE_ANNOTATION = String.raw`:\s*[A-Za-z_$&][\w$.<>\[\]|&'\s]{0,60}?\s*=(?![=>])`;
const REFERENCE_VALUE = /^(?:\$|<|\{\{|%|--|process\.env|import\.meta\.env|secret:|keychain:|env:|environment:|vault:|ref:|file:|[a-z][a-z0-9+.-]*:\/\/)/i;
const PLACEHOLDER_VALUE = /\$\{|\{\{|\.\.\.|…|<[^>]*>|x{4,}|\*{4,}|example|placeholder|change[-_]?me|redacted|dummy|your[-_ ]|my[-_]secret|todo/i;

/** @type {{ id: string, label: string, re: RegExp, valueGroup?: string, accept?: (value: string) => boolean }[]} */
export const RULES = [
  { id: "anthropic-key", label: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: "openai-key", label: "OpenAI API key", re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g,
    // A long hyphenated word is not a key; a key has digits in its random part.
    accept: (value) => /\d/.test(value) },
  { id: "github-token", label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { id: "github-fine-grained-token", label: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { id: "slack-token", label: "Slack token", re: /\bxox[abeprs]-[A-Za-z0-9-]{10,}|\bxapp-\d-[A-Za-z0-9-]{10,}/g },
  { id: "slack-webhook", label: "Slack webhook URL", re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]{16,}/g },
  { id: "aws-access-key", label: "AWS access key id", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "private-key", label: "Private key block", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
  { id: "google-api-key", label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { id: "jwt", label: "JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { id: "assigned-secret", label: "Hard-coded secret assignment",
    re: new RegExp(String.raw`${NAME}["']?\s*(?:${TYPE_ANNOTATION}|:=|=>|[:=])\s*["'\`](?<value>[^"'\`\s]{12,})["'\`]`, "gi"),
    valueGroup: "value",
    // A random secret mixes letters and digits; a word, a path or an identifier usually has no digit.
    accept: (value) => !REFERENCE_VALUE.test(value) && !PLACEHOLDER_VALUE.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value) },
];

/** Parse the allow-list text into entries; throws on a line without a reason or with a broken regex. */
export function parseAllowlist(text, source = DEFAULT_ALLOWLIST) {
  const entries = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const where = `${source}:${index + 1}`;
    const split = line.search(/\s#(?:\s|$)/);
    const spec = (split === -1 ? line : line.slice(0, split)).trim();
    const reason = split === -1 ? "" : line.slice(split).replace(/^\s*#\s*/, "").trim();
    if (!reason) throw new Error(`${where}: an allow-list entry needs a reason, written as "<value>  # reason"`);
    const regex = /^\/(.+)\/([a-z]*)$/.exec(spec);
    if (regex) {
      let re;
      try { re = new RegExp(regex[1], regex[2]); } catch (error) { throw new Error(`${where}: invalid regular expression (${error.message})`); }
      entries.push({ kind: "regex", re, spec, reason, where });
    } else {
      entries.push({ kind: "fixed", value: spec, spec, reason, where });
    }
  });
  return entries;
}

/** Whether an allow-list entry covers this value. */
export const isAllowed = (entries, value) => entries.some((entry) => {
  if (entry.kind === "fixed") return entry.value === value;
  entry.re.lastIndex = 0;
  return entry.re.test(value);
});

/** Findings in one added line. Every finding carries the value it matched, for the allow-list and the preview. */
export function scanLine(line) {
  const found = [];
  const seen = new Set();
  // The specific shapes come first, so a key assigned to `api_key` is reported once, as the key it is.
  for (const rule of RULES) {
    for (const match of line.matchAll(rule.re)) {
      const value = rule.valueGroup ? match.groups?.[rule.valueGroup] : match[0];
      if (!value || seen.has(value) || (rule.accept && !rule.accept(value))) continue;
      seen.add(value);
      found.push({ rule: rule.id, label: rule.label, value });
    }
  }
  return found;
}

/** `sk-a…(51 chars)`: enough to find the line, not enough to use the key from a CI log. */
export const redact = (value) => value.length <= 8 ? `…(${value.length} chars)` : `${value.slice(0, 4)}…(${value.length} chars)`;

function fail(message) {
  console.error(`secrets:check: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { base: process.env.SECRET_SCAN_BASE || "origin/main", head: "HEAD", all: false, allowlist: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i] ?? fail(`${arg} needs a value`);
    if (arg === "--all") options.all = true;
    else if (arg === "--base") options.base = value();
    else if (arg === "--head") options.head = value();
    else if (arg === "--allowlist") options.allowlist = value();
    else if (arg === "--help" || arg === "-h") { console.log("usage: check-secrets [--base <ref>] [--head <ref>] [--all] [--allowlist <file>]"); process.exit(0); }
    else fail(`unknown argument ${arg}`);
  }
  return options;
}

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function resolveRange(cwd, options) {
  let head;
  try { head = git(cwd, ["rev-parse", "--verify", "--quiet", `${options.head}^{commit}`]); } catch { fail(`cannot resolve head "${options.head}"`); }
  if (options.all) return { mode: "tree", head, description: `every text line at ${options.head}` };
  // A push that creates a branch has an all-zero previous tip: there is nothing to compare, so audit the head.
  if (/^0{40,64}$/.test(options.base)) return { mode: "tree", head, description: `every text line at ${options.head} (new branch)` };
  let base;
  try { base = git(cwd, ["rev-parse", "--verify", "--quiet", `${options.base}^{commit}`]); }
  catch { fail(`cannot resolve base "${options.base}". Fetch it (git fetch origin main), or pass --base <ref>.`); }
  let mergeBase;
  try { mergeBase = git(cwd, ["merge-base", base, head]); }
  catch { fail(`no merge base between "${options.base}" and "${options.head}". In CI fetch the full history (fetch-depth: 0); locally run git fetch origin main.`); }
  return { mode: "commits", from: mergeBase, head, description: `commits since ${mergeBase.slice(0, 10)} (merge base of ${options.base} and ${options.head})` };
}

const C_ESCAPES = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, "\\": 92 };

/**
 * Decode a path that git wrote as a C-style quoted string (`"b/we\"ird.ts"`, `"b/tab\there.ts"`, `"b/caf\303\251.ts"`): the
 * escapes git writes are \a \b \f \n \r \t \v \" \\ and three-digit octal bytes (UTF-8). Every other character is kept as it
 * is (core.quotepath=off leaves non-ASCII names unescaped). A path that is not quoted is returned unchanged; one whose
 * quoting is broken gives null, and the caller falls back to the raw text instead of guessing.
 */
export function unquoteGitPath(text) {
  if (!text.startsWith('"')) return text;
  const chars = Array.from(text);
  const bytes = [];
  for (let i = 1; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '"') return Buffer.from(bytes).toString("utf8");
    if (ch !== "\\") { bytes.push(...Buffer.from(ch, "utf8")); continue; }
    const octal = /^[0-7]{3}$/.exec(chars.slice(i + 1, i + 4).join(""));
    if (octal) { bytes.push(parseInt(octal[0], 8)); i += 3; continue; }
    const code = C_ESCAPES[chars[i + 1]];
    if (code === undefined) return null;
    bytes.push(code);
    i++;
  }
  return null;
}

/**
 * The file a "+++ " header names, for the label of the lines under it. Git writes `b/<path>`, quoted when the name has a
 * quote, a backslash or a control character, and ends a name that holds a space with a tab. null only for /dev/null (a
 * deletion has no added lines). Anything this cannot decode or does not recognise is returned as the raw header text, so
 * the lines under it are still scanned.
 */
export function diffHeaderPath(header) {
  if (header === "/dev/null") return null;
  if (header.startsWith('"')) {
    const path = unquoteGitPath(header);
    if (path === null) return header;
    return path.startsWith("b/") ? path.slice(2) : path;
  }
  const bare = header.replace(/\t.*$/, "");
  return bare.startsWith("b/") ? bare.slice(2) : bare;
}

/** A path for the log: control characters are written as escapes, so a name cannot start a line or paint the terminal. */
export const printablePath = (file) => file.replace(/[\u0000-\u001f\u007f]/g, (ch) => ({ "\n": "\\n", "\r": "\\r", "\t": "\\t" })[ch] ?? `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`);

/**
 * Stream the patch text and call `onLine(file, lineNumber, text, commit)` for every added line. A "commits" range is read
 * with `git log -p`, one commit at a time (`commit` is its short id; merge commits add nothing of their own); a "tree" range
 * is read as one diff from the empty tree (`commit` is null).
 */
function forEachAddedLine(cwd, range, onLine) {
  // --no-ext-diff and --no-textconv: read the added lines as committed, not as a driver from the user's own git
  // configuration or attributes file would rewrite them. The prefixes are fixed so diff.noprefix cannot change the headers.
  const common = ["--unified=0", "--no-color", "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "--find-renames", "--diff-filter=ACMRT"];
  const args = range.mode === "tree"
    ? ["diff", ...common, EMPTY_TREE, range.head, "--"]
    : ["log", "-p", "--no-merges", ...common, "--format=commit:%H", `${range.from}..${range.head}`, "--"];
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-c", "core.quotepath=off", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    let commit = null;
    let file = null;
    let inHunk = false;
    let next = 0;
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (text) => {
      // At zero context every hunk line starts with +, - or a backslash, so a "commit:" line can only be a record header.
      if (text.startsWith("commit:")) { commit = text.slice(7, 15); file = null; inHunk = false; return; }
      if (text.startsWith("diff --git ")) { file = null; inHunk = false; return; }
      if (!inHunk && text.startsWith("+++ ")) { file = diffHeaderPath(text.slice(4)); return; }
      if (text.startsWith("@@")) {
        inHunk = true;
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
        next = hunk ? Number(hunk[1]) : 0;
        return;
      }
      if (inHunk && text.startsWith("+") && file) onLine(file, next++, text.slice(1), commit);
    });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`git ${args[0]} failed (${code}): ${stderr.trim()}`)));
  });
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.env.SECRET_SCAN_ROOT ? path.resolve(process.env.SECRET_SCAN_ROOT) : root;
  const allowlistPath = path.resolve(cwd, options.allowlist ?? DEFAULT_ALLOWLIST);
  let allowlist = [];
  if (existsSync(allowlistPath)) {
    try { allowlist = parseAllowlist(readFileSync(allowlistPath, "utf8"), path.relative(cwd, allowlistPath) || allowlistPath); }
    catch (error) { fail(error.message); }
  } else if (options.allowlist) fail(`allow-list ${options.allowlist} does not exist`);

  const range = resolveRange(cwd, options);
  const findings = [];
  let scanned = 0;
  let allowed = 0;
  try {
    await forEachAddedLine(cwd, range, (file, line, text, commit) => {
      scanned++;
      for (const finding of scanLine(text)) {
        if (isAllowed(allowlist, finding.value)) { allowed++; continue; }
        findings.push({ file, line, commit, ...finding });
      }
    });
  } catch (error) { fail(error.message); }

  if (!findings.length) {
    console.log(`secrets:check: no secrets in ${range.description} (${scanned} lines scanned${allowed ? `, ${allowed} allow-listed` : ""}).`);
    return;
  }
  console.error(`secrets:check: ${findings.length} possible secret${findings.length === 1 ? "" : "s"} in ${range.description}:`);
  for (const finding of findings) console.error(`  ${printablePath(finding.file)}:${finding.line}  ${finding.label} (${finding.rule})  ${redact(finding.value)}${finding.commit ? `  in ${finding.commit}` : ""}`);
  console.error([
    "",
    "A real credential: take it out of the commits (rebase or squash, a later commit that only deletes it is not enough), rotate it, and keep it in the sealed secret store or an environment variable.",
    `A test fixture that is already public on main: add its exact value to ${DEFAULT_ALLOWLIST} as "<value>  # why it is test data".`,
  ].join("\n"));
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
