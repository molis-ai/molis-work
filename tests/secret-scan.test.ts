import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { diffHeaderPath, isAllowed, parseAllowlist, printablePath, redact, scanLine, unquoteGitPath } from "../scripts/check-secrets.mjs";

// Secret scan (repository-anti-corruption §4.18): the lines a branch adds are checked for credential shapes, and a value
// that is known test data can be allow-listed. Every credential below is assembled at run time from harmless pieces, so
// this file never contains a key shape itself and the scan can read it like any other file in the branch.
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-secrets.mjs");
const REAL_ALLOWLIST = join(dirname(fileURLToPath(import.meta.url)), "..", "tooling", "gates", "secret-allowlist.txt");
const join2 = (...parts: string[]) => parts.join("");
const randomish = (length: number) => "q7Zk3Rm9Xa2Vb8Lc4Nd6Pe1Sf5Tg0Uh".repeat(4).slice(0, length);

const PLANTED: Record<string, string> = {
  "anthropic-key": join2("sk-", "ant-api03-", randomish(40)),
  "openai-key": join2("sk-", "proj-", randomish(40)),
  "github-token": join2("gh", "p_", randomish(36)),
  "github-fine-grained-token": join2("github", "_pat_", "11A", randomish(40)),
  "slack-token": join2("xo", "xb-", "123456789012-", "AbCdEfGhIjKlMnOp"),
  "slack-webhook": join2("https://hooks.", "slack.com/services/", "T0123ABCD/B0123ABCD/", randomish(24)),
  "aws-access-key": join2("AK", "IA", "QWERTYUIOP123456"),
  "private-key": join2("-----BEGIN ", "RSA PRIVATE KEY-----"),
  "google-api-key": join2("AI", "za", randomish(35)),
  "jwt": join2("ey", "JhbGciOiJIUzI1NiJ9", ".ey", "JzdWIiOiIxMjM0NTY3ODkwIn0", ".", randomish(24)),
  "assigned-secret": randomish(24),
};

const ruleIds = (line: string) => scanLine(line).map(finding => finding.rule);

test("every secret shape in the rule set is caught on an added line", () => {
  for (const [rule, secret] of Object.entries(PLANTED)) {
    const line = rule === "assigned-secret" ? join2("const ", "api_key", " = '", secret, "';") : `export const value = "${secret}"; // pasted by mistake`;
    assert.ok(ruleIds(line).includes(rule), `${rule} should be reported for: ${rule === "private-key" ? "(private key header)" : redact(secret)}`);
  }
});

test("assignments of a hard-coded secret are caught in the notations code and config use", () => {
  const value = PLANTED["assigned-secret"];
  for (const line of [
    join2("password", ": \"", value, "\","),
    join2("\"client_secret\": \"", value, "\""),
    join2("OPENAI_API_KEY", "=\"", value, "\""),
    join2("authToken", " := `", value, "`"),
    join2("SERVICE_PASSWORD", ": '", value, "'"),
  ]) assert.deepEqual(ruleIds(line), ["assigned-secret"], line.replace(value, redact(value)));
});

test("an assignment is caught with a type annotation before the equals sign and for the names a secret half goes by", () => {
  const value = PLANTED["assigned-secret"];
  for (const line of [
    join2("const apiKey", ": string = \"", value, "\";"),
    join2("export const API_TOKEN", ": string | undefined = '", value, "';"),
    join2("let password", ": Readonly<string> = `", value, "`;"),
    join2("val clientSecret", ": String = \"", value, "\""),
    join2("api_key", ": str = \"", value, "\""),
    join2("let secret", ": &'static str = \"", value, "\";"),
    join2("secretKey", ": \"", value, "\","),
    join2("SecretKey", "=\"", value, "\""),
    join2("private_key", " = '", value, "'"),
    join2("\"privateKey\"", ": \"", value, "\""),
    join2("aws_secret_access_key", " = \"", value, "\""),
    join2("AWS_SECRET_ACCESS_KEY", "=\"", value, "\""),
    join2("accessKey", ": \"", value, "\","),
    join2("client_key", ": '", value, "'"),
    join2("authKey", " = \"", value, "\""),
    join2("signingKey", ": \"", value, "\","),
    join2("encryption_key", ": \"", value, "\","),
    join2("client_token", " = \"", value, "\""),
    join2("private_token", ": \"", value, "\","),
  ]) assert.deepEqual(ruleIds(line), ["assigned-secret"], line.replace(value, redact(value)));
});

test("a name that only ends in key, a comparison and a type with no value are not reported as assignments", () => {
  const value = PLANTED["assigned-secret"];
  for (const line of [
    join2("const monkey", " = \"", value, "\";"),
    join2("const turkey", ": string = \"", value, "\";"),
    join2("if (token", " === \"", value, "\") return;"),
    join2("if (apiKey", ": string == \"", value, "\") return;"),
    join2("const apiKey", ": string = process.env.", "SERVICE_API_KEY;"),
    join2("const secretKey", ": string = \"${", "SERVICE_SECRET_KEY}", "\";"),
    join2("private_key", " = \"secret://", "home/signing-key-1\""),
    join2("interface Options { apiKey", ": string; secretKey: string }"),
  ]) assert.deepEqual(ruleIds(line), [], line.replace(value, redact(value)));
});

test("references, placeholders, short values and ordinary words are not reported", () => {
  const quiet = [
    join2("api_key", " = process.env.", "SERVICE_API_KEY"),
    join2("token", ": \"${", "SERVICE_TOKEN}", "\""),
    join2("password", ": \"<your", "-password-here>\""),
    join2("secret", ": \"secret://", "home/openai-key-1\""),
    join2("token", ": \"", "https://oauth2.example.org/token", "\""),
    join2("password", ": \"", "short1\""),
    join2("token", ": \"", "an-ordinary-hyphenated-word", "\""),
    join2("--token", ": \"--", "surface-soft-2", "\""),
    join2("const skeleton = \"sk-", "this-is-only-a-long-hyphenated-word\""),
    "the quick brown fox jumps over the lazy dog",
    "ghost-writer-draft and AKIA is a prefix",
  ];
  for (const line of quiet) assert.deepEqual(ruleIds(line), [], line);
});

test("a finding is shown redacted", () => {
  const secret = PLANTED["anthropic-key"];
  assert.equal(redact(secret), `${secret.slice(0, 4)}…(${secret.length} chars)`);
  assert.ok(!redact(secret).includes(secret.slice(8)));
  assert.equal(redact("short"), "…(5 chars)");
});

test("the allow-list needs a reason for every entry, takes fixed strings and regular expressions, and rejects broken ones", () => {
  const entries = parseAllowlist([
    "# comment", "", "  # indented comment",
    "fixed-value-1234  # a fixture",
    "/^synthetic-[0-9]+$/  # numbered fixtures",
  ].join("\n"));
  assert.equal(entries.length, 2);
  assert.ok(isAllowed(entries, "fixed-value-1234"));
  assert.ok(!isAllowed(entries, "fixed-value-12345"), "a fixed string must equal the value");
  assert.ok(isAllowed(entries, "synthetic-9981"));
  assert.ok(!isAllowed(entries, "synthetic-x"));
  assert.throws(() => parseAllowlist("no-reason-here"), /needs a reason/);
  assert.throws(() => parseAllowlist("no-reason-either  #"), /needs a reason/);
  assert.throws(() => parseAllowlist("/([/  # broken"), /invalid regular expression/);
});

test("the checked-in allow-list parses and covers the known fixtures without covering a real-looking key", () => {
  const entries = parseAllowlist(readFileSync(REAL_ALLOWLIST, "utf8"));
  assert.ok(entries.length > 0);
  for (const line of [
    'controlToken: "route-test-control-0123456789abcdef"',
    '"x-molis-work-control-token": "route-test-control-0123456789abcdef"',
    'previous_action_token":"015c71bbe8e02f95e8983236eca05686","project',
  ]) {
    const findings = scanLine(line);
    assert.ok(findings.length > 0, `the scan sees ${line}`);
    assert.ok(findings.every(finding => isAllowed(entries, finding.value)), `${line} is allow-listed`);
  }
  for (const finding of [...scanLine(`apiKey = "${PLANTED["assigned-secret"]}"`), ...scanLine(PLANTED["anthropic-key"])]) {
    assert.ok(!isAllowed(entries, finding.value), `${redact(finding.value)} is not covered by the allow-list`);
  }
});

test("git's quoted diff header paths are decoded, and an unknown header form is scanned under its raw text", () => {
  assert.equal(unquoteGitPath('"b/we\\"ird.ts"'), "b/we\"ird.ts");
  assert.equal(unquoteGitPath('"b/back\\\\slash.ts"'), "b/back\\slash.ts");
  assert.equal(unquoteGitPath('"b/tab\\there.ts"'), "b/tab\there.ts");
  assert.equal(unquoteGitPath('"b/new\\nline.ts"'), "b/new\nline.ts");
  assert.equal(unquoteGitPath('"b/caf\\303\\251.ts"'), "b/caf\u00e9.ts", "octal escapes are UTF-8 bytes");
  assert.equal(unquoteGitPath('"b/caf\u00e9 \\"x\\".ts"'), 'b/caf\u00e9 "x".ts', "raw non-ASCII characters stay as they are");
  assert.equal(unquoteGitPath("b/plain.ts"), "b/plain.ts", "an unquoted path is returned as is");
  assert.equal(unquoteGitPath('"b/unterminated.ts'), null, "a broken quote is not guessed at");
  assert.equal(unquoteGitPath('"b/bad\\q.ts"'), null, "an escape git never writes is not guessed at");

  assert.equal(diffHeaderPath("b/src/plain.ts"), "src/plain.ts");
  assert.equal(diffHeaderPath("b/sp ace.ts\t"), "sp ace.ts", "git ends a name that holds a space with a tab");
  assert.equal(diffHeaderPath('"b/we\\"ird.ts"'), 'we"ird.ts');
  assert.equal(diffHeaderPath('"b/caf\\303\\251.ts"'), "caf\u00e9.ts");
  assert.equal(diffHeaderPath("/dev/null"), null, "there is nothing to scan behind /dev/null");
  assert.equal(diffHeaderPath("c/src/other.ts"), "c/src/other.ts", "another prefix is kept as written, not dropped");
  assert.equal(diffHeaderPath('"b/unterminated.ts'), '"b/unterminated.ts', "a header that cannot be decoded is scanned under its raw text");

  assert.equal(printablePath("src/plain.ts"), "src/plain.ts");
  assert.equal(printablePath("we\"ird.ts"), 'we"ird.ts');
  assert.equal(printablePath("new\nline.ts"), "new\\nline.ts", "a newline in a name cannot start a line of its own in a log");
  assert.equal(printablePath("esc\u001b[31m.ts"), "esc\\x1b[31m.ts");
});

// The same steps a CI run takes: a real repository, a base branch, a branch that adds lines.
function repository(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "molis-secret-scan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=scan", "-c", "user.email=scan@example.org", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8" }).trim();
  const write = (file: string, text: string) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };
  const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "-m", message); return git("rev-parse", "HEAD"); };
  const scan = (...args: string[]) => {
    const env = { ...process.env, SECRET_SCAN_ROOT: root };
    delete env.SECRET_SCAN_BASE;
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: "utf8", env });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  };
  git("init", "-q", "-b", "main");
  return { root, git, write, commit, scan };
}

test("a planted key in an added line fails the scan with its file and line, and an allow-listed fixture does not", t => {
  const repo = repository(t);
  repo.write("README.md", "# project\n");
  const base = repo.commit("base");
  repo.git("checkout", "-q", "-b", "feature");
  const key = PLANTED["anthropic-key"];
  repo.write("src/client.ts", ["export const model = 'x';", "", `const key = "${key}";`, ""].join("\n"));
  repo.write("tests/server.test.ts", `const server = start({ controlToken: "route-test-control-0123456789abcdef" });\n`);
  repo.commit("add client");

  const caught = repo.scan("--base", base);
  assert.equal(caught.status, 1, caught.out);
  assert.match(caught.out, /src\/client\.ts:3 {2}Anthropic API key/);
  assert.match(caught.out, /tests\/server\.test\.ts:1 {2}Hard-coded secret assignment/, "an unlisted fixture is a finding until it is allow-listed");
  assert.ok(!caught.out.includes(key), "the key is never printed");
  assert.ok(!caught.out.includes(key.slice(12)), "not even most of it");

  const allowlist = join(repo.root, "allow.txt");
  writeFileSync(allowlist, [
    `${key}  # the planted key is a fixture of this test`,
    "/^route-test-control-[0-9a-f]+$/  # synthetic test control token",
  ].join("\n"));
  const allowed = repo.scan("--base", base, "--allowlist", allowlist);
  assert.equal(allowed.status, 0, allowed.out);
  assert.match(allowed.out, /no secrets/);
  assert.match(allowed.out, /2 allow-listed/);
});

test("only the lines the branch adds are scanned, measured from the merge base", t => {
  const repo = repository(t);
  const old = PLANTED["openai-key"];
  repo.write("config.ts", `export const legacy = "${old}";\n`);
  repo.write("notes.md", "one\n");
  repo.commit("base already holds an old key");
  repo.git("checkout", "-q", "-b", "feature");
  repo.write("notes.md", "one\ntwo\n");
  repo.commit("feature edits a different file");

  const clean = repo.scan("--base", "main");
  assert.equal(clean.status, 0, clean.out);
  assert.match(clean.out, /1 lines scanned/);

  repo.git("checkout", "-q", "main");
  repo.write("other.ts", `export const later = "${PLANTED["github-token"]}";\n`);
  repo.commit("main moves on with its own key");
  repo.git("checkout", "-q", "feature");
  const afterMainMoved = repo.scan("--base", "main");
  assert.equal(afterMainMoved.status, 0, "what main added after the branch point is not this branch's");

  const audit = repo.scan("--all");
  assert.equal(audit.status, 1, "--all audits every line at the head");
  assert.match(audit.out, /config\.ts:1/);
});

test("every commit of the branch is read: a key that a later commit deletes is still in the pushed history", t => {
  const repo = repository(t);
  repo.write("a.txt", "a\n");
  const base = repo.commit("base");
  repo.git("checkout", "-q", "-b", "feature");
  repo.write("b.ts", `const k = "${PLANTED["github-token"]}";\n`);
  const leaked = repo.commit("add key");
  repo.write("b.ts", "const k = process.env.GITHUB_TOKEN;\n");
  repo.commit("replace it by a reference");
  const result = repo.scan("--base", base);
  assert.equal(result.status, 1, "deleting it in a later commit does not take it out of the history");
  assert.match(result.out, new RegExp(`b\\.ts:1 {2}GitHub token \\(github-token\\) .* in ${leaked.slice(0, 8)}`));

  repo.git("reset", "-q", "--soft", base);
  repo.commit("one clean commit");
  assert.equal(repo.scan("--base", base).status, 0, "after the branch is rewritten the range is clean");
});

test("an unknown base is refused with exit 2 and a hint, not silently passed", t => {
  const repo = repository(t);
  repo.write("a.txt", "a\n");
  repo.commit("base");
  const refused = repo.scan("--base", "origin/main");
  assert.equal(refused.status, 2, refused.out);
  assert.match(refused.out, /cannot resolve base "origin\/main"/);
  const noReason = join(repo.root, "bad-allow.txt");
  writeFileSync(noReason, "some-value\n");
  const malformed = repo.scan("--all", "--allowlist", noReason);
  assert.equal(malformed.status, 2);
  assert.match(malformed.out, /needs a reason/);
});

test("files whose names git quotes in diff headers are scanned like any other", t => {
  const repo = repository(t);
  repo.write("README.md", "# project\n");
  const base = repo.commit("base");
  repo.git("checkout", "-q", "-b", "feature");
  const line = `const k = "${PLANTED["aws-access-key"]}";\n`;
  const names = ['we"ird.ts', "back\\slash.ts", "tab\there.ts", "new\nline.ts", "sp ace.ts", "caf\u00e9.ts", "src/\u4e2d\u6587 \"quoted\".ts"];
  for (const name of names) repo.write(name, line);
  repo.commit("add files with names git quotes");

  const result = repo.scan("--base", base);
  assert.equal(result.status, 1, result.out);
  const reported = result.out.split("\n").filter(row => row.includes("(aws-access-key)")).map(row => row.trim().split(":1 ")[0]);
  assert.deepEqual(reported.sort(), ['back\\slash.ts', 'caf\u00e9.ts', 'new\\nline.ts', 'sp ace.ts', 'src/\u4e2d\u6587 "quoted".ts', 'tab\\there.ts', 'we"ird.ts'].sort(), result.out);
  assert.ok(!result.out.includes(PLANTED["aws-access-key"]), "the key is never printed");

  const audit = repo.scan("--all");
  assert.equal(audit.status, 1, audit.out);
  assert.equal(audit.out.split("\n").filter(row => row.includes("(aws-access-key)")).length, names.length, "--all reads quoted names too");
});

test("a git config in the scanner's environment does not change which lines it reads", t => {
  const repo = repository(t);
  repo.write("README.md", "# project\n");
  const base = repo.commit("base");
  repo.git("checkout", "-q", "-b", "feature");
  // A textconv filter from a user's attributes file rewrites the patch git shows (the repository itself has no .gitattributes),
  // and diff.noprefix drops the b/ prefix of every header; the scan must read the real added lines under both.
  writeFileSync(join(repo.root, ".git", "info", "attributes"), "*.ts diff=mask\n");
  repo.git("config", "diff.mask.textconv", "sed -e s/AKIA/xxxx/");
  repo.git("config", "diff.noprefix", "true");
  repo.write("src/client.ts", `const k = "${PLANTED["aws-access-key"]}";\n`);
  repo.write("b/lib.ts", `const k = "${PLANTED["aws-access-key"]}";\n`);
  repo.commit("add client");

  const result = repo.scan("--base", base);
  assert.equal(result.status, 1, result.out);
  assert.match(result.out, /^ {2}src\/client\.ts:1 {2}AWS access key id/m);
  assert.match(result.out, /^ {2}b\/lib\.ts:1 {2}AWS access key id/m, "a directory called b keeps its name when diff.noprefix is set");
  assert.equal(repo.scan("--all").status, 1, "the tree audit reads the same lines");
});
