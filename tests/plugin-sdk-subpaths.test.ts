import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { redactSecrets } from "@molis-ai/molis-work-plugin-sdk";
import * as highlight from "@molis-ai/molis-work-plugin-sdk/highlight";

// specs/coding-plugin/spec.md §K (PG-062, C7): code colouring, rich text and secret redaction live once, in the plugin SDK, so a
// third-party plugin gets what Coding, Feed, the workbench, the Host and the desktop shell use. These tests read the SDK as a plugin
// gets it: the built files its package.json declares.
const root = fileURLToPath(new URL("..", import.meta.url));
const sdkDirectory = join(root, "packages/plugin-sdk");
type Manifest = {
  exports: Record<string, { import: string }>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
const manifest = JSON.parse(readFileSync(join(sdkDirectory, "package.json"), "utf8")) as Manifest;
const built = (subpath: string) => readFileSync(join(sdkDirectory, manifest.exports[subpath]!.import), "utf8");
const IMPORT = /^\s*import[\s{*"']|\bimport\s*\(|\brequire\s*\(|^\s*export\s[^;]*?\bfrom\s*["']/mu;

test("W5-01-CODING-60: /highlight imports nothing and each function runs alone from its source, as a page script carries it", () => {
  assert.doesNotMatch(built("./highlight"), IMPORT);
  // What Coding's client.ts does: each function's source pasted into the page script, with the tokenizer passed in.
  const alone = <T>(fn: T): T => new Function(`return (${String(fn)});`)() as T;
  const tokens = alone(highlight.codeTokens), grow = alone(highlight.growCodeTokens), rows = alone(highlight.diffRowTokens), language = alone(highlight.codeLanguage);
  const samples: Array<[string, string]> = [
    ["ts", "// note\nexport function add(a: number, b = 2): number {\n  return a + b; /* open\n still */\n}\nconst s = `x${1}`;\n"],
    ["py", "def greet(name):\n    \"\"\"Say hi.\"\"\"\n    return f\"hi {name}\"  # done\n"],
    ["html", "<a href=\"https://example.com\" title='x'>link</a>\n<!-- c -->\n"],
    ["json", "{ \"a\": [1, 2.5, true, null], \"b\": \"s\" }\n"],
    ["diff", "@@ -1,2 +1,2 @@\n-const a = 1;\n+const a = 2;\n same\n"],
  ];
  for (const [lang, text] of samples) {
    assert.deepEqual(tokens(text, lang), highlight.codeTokens(text, lang), lang);
    const first = grow(null, text.slice(0, text.length >> 1), lang, tokens);
    assert.deepEqual(grow(first, text, lang, tokens), highlight.growCodeTokens(highlight.growCodeTokens(null, text.slice(0, text.length >> 1), lang, highlight.codeTokens), text, lang, highlight.codeTokens), lang);
  }
  const diff = [{ text: "/* begins", kind: "delete" }, { text: "still comment */ code()", kind: "delete" }, { text: "plain()", kind: "insert" }];
  assert.deepEqual(rows(diff, "ts", tokens), highlight.diffRowTokens(diff, "ts", highlight.codeTokens));
  for (const hint of ["src/app.tsx", "language-python", "Dockerfile", "notes.md"]) assert.equal(language(hint), highlight.codeLanguage(hint), hint);
});

test("W5-01-CODING-61: only /rich-text loads the Markdown parser and sanitizer, which the SDK takes as optional peers", () => {
  const parsers = /["'](?:marked|sanitize-html)["']/u;
  assert.match(built("./rich-text"), parsers);
  // Every other built file of the SDK, the root entry and /highlight among them, loads neither.
  const dist = join(sdkDirectory, "dist");
  const others = readdirSync(dist).filter(name => name.endsWith(".js") && name !== "rich-text.js");
  assert.ok(others.includes("index.js") && others.includes("highlight.js"));
  for (const name of others) assert.doesNotMatch(readFileSync(join(dist, name), "utf8"), parsers, name);
  // A plugin author's project installs contracts and the SDK alone (tests/plugin-sample.e2e.test.ts installs them offline from an
  // empty cache); a runtime dependency on the parsers would make that install fetch them. A plugin that renders rich text adds them.
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ["@molis-ai/molis-work-contracts"]);
  for (const name of ["marked", "sanitize-html"]) {
    assert.ok(manifest.peerDependencies?.[name], `${name} is a peer of the SDK`);
    assert.equal(manifest.peerDependenciesMeta?.[name]?.optional, true, `${name} is an optional peer`);
  }
  // The README tells such a plugin what to add, with the peer ranges; the workbench and the Host add the same ranges.
  const readme = readFileSync(join(sdkDirectory, "README.md"), "utf8");
  for (const name of ["marked", "sanitize-html"]) {
    const range = manifest.peerDependencies![name]!;
    assert.ok(readme.includes(`\`${name}@${range}\``), `the README names ${name}@${range}`);
    for (const consumer of ["apps/workbench", "apps/local-host"]) {
      const declared = (JSON.parse(readFileSync(join(root, consumer, "package.json"), "utf8")) as Manifest).dependencies?.[name];
      assert.equal(declared, range, `${consumer} declares ${name} in the SDK's peer range`);
    }
  }
});

test("W5-01-CODING-62: redactSecrets masks copied credentials and leaves the rest of the text as it was", () => {
  // Fixtures are assembled at run time, as in tests/secret-scan.test.ts, so the repository's own secret scan does not flag them.
  const jwt = `eyJ${"a".repeat(12)}.${"b".repeat(12)}.${"c".repeat(12)}`;
  const pem = (edge: string) => `-----${edge} RSA PRIVATE KEY-----`;
  const text = [
    "Deploy notes for Friday.",
    `${pem("BEGIN")}\nMIIEow\n${pem("END")}`,
    "Authorization: Bearer abc.def",
    "Cookie: session=1",
    "api_key=abcd1234 and \"password\": \"hunter2\"",
    `token ghp_${"x".repeat(24)} and sk-${"y".repeat(24)} and AKIA${"Z".repeat(16)}`,
    `jwt ${jwt}`,
  ].join("\n");
  const redacted = redactSecrets(text);
  for (const secret of ["MIIEow", "Bearer abc.def", "session=1", "abcd1234", "hunter2", `ghp_${"x".repeat(24)}`, `sk-${"y".repeat(24)}`, `AKIA${"Z".repeat(16)}`, jwt]) {
    assert.ok(!redacted.includes(secret), secret);
  }
  assert.match(redacted, /^Deploy notes for Friday\.\n\[REDACTED PRIVATE KEY\]\nAuthorization: \[REDACTED\]\nCookie: \[REDACTED\]\n/u);
  assert.match(redacted, /api_key=\[REDACTED\] and "password": \[REDACTED\]/u);
  assert.equal(redactSecrets("plain words, no secrets: 42"), "plain words, no secrets: 42");
});

test("W5-01-CODING-63: there is one copy: Coding and Feed hold and export none of it", () => {
  for (const gone of ["plugins/native/coding/src/highlight.ts", "plugins/native/feed/src/rich-content.ts", "plugins/native/feed/src/context.ts"]) {
    assert.equal(existsSync(join(root, gone)), false, gone);
  }
  const names = /\b(?:codeTokens|growCodeTokens|diffRowTokens|codeLanguage|renderFeedRichText|feedPlainText|redactFeedContextSecrets|renderRichText|richPlainText|redactSecrets)\b/u;
  for (const entry of ["plugins/native/coding/src/index.ts", "plugins/native/feed/src/index.ts"]) {
    assert.doesNotMatch(readFileSync(join(root, entry), "utf8"), names, entry);
  }
});
