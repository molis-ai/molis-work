import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { CONTEXTUAL_PACKAGES, kernelContextualProblems } from "../scripts/gates/kernel-contextual.mjs";

// specs/repository-anti-corruption N-04 (W3-04), decision N-03: packages/kernel has a core (directory, dispatch, availability,
// grants, scene compatibility) and one platform product service, contextual ranking (contextual.ts), which stays in the kernel
// and must stay pure. scripts/gates/kernel-contextual.mjs (in `pnpm health:check`, no baseline) keeps the boundary between the two:
//   K1 the core does not depend on contextual ranking   K2 only contextual ranking reads Contracts services/*
//   K3 contextual ranking reads two Contracts, node:crypto and kernel files   K4 it is pure   K5 directory-derived code names no capability
// The definitions are checked on the real kernel sources with one violation added in memory (quick to write down), and the wiring
// into scripts/check-health-gates.mjs on a small scratch repository (`--base main` fails with the rule's message).
const KERNEL = "packages/kernel/src/";
const INDEX = `${KERNEL}index.ts`;
const SERVICE = `${KERNEL}action-service.ts`;
const CONTEXTUAL = `${KERNEL}contextual.ts`;
const OFFERS = `${KERNEL}subject-offer-choices.ts`;

const kernelDirectory = fileURLToPath(new URL("../packages/kernel/src/", import.meta.url));
const real: Record<string, string> = Object.fromEntries(readdirSync(kernelDirectory).filter((name) => name.endsWith(".ts"))
  .map((name) => [`${KERNEL}${name}`, readFileSync(path.join(kernelDirectory, name), "utf8")]));
type Changes = Record<string, string | null>;
const snapshot = (changes: Changes = {}) => {
  const texts: Record<string, string | null> = { ...real, ...changes };
  return { files: Object.keys(texts).filter((file) => texts[file] !== null), read: (file: string) => texts[file] ?? null };
};
const prepend = (file: string, text: string): Changes => ({ [file]: `${text}\n${real[file]}` });
const append = (file: string, text: string): Changes => ({ [file]: `${real[file]}\n${text}` });
const problems = (changes: Changes = {}, options?: { entryReexports: Set<string> }) => kernelContextualProblems(snapshot(changes), options) as string[];
const NO_ENTRY = { entryReexports: new Set<string>() };
// An entry that re-exports a contextual name, whatever the real one does today: the allowance for it is given explicitly.
const ENTRY_WITH_NAME: Changes = { [INDEX]: `export { planContextualLayout } from "./contextual.js";\n${real[INDEX]}` };
const ALLOW_INDEX = { entryReexports: new Set([INDEX]) };
const failsWith = (found: string[], pattern: RegExp) => assert.ok(found.some((message) => pattern.test(message)), `expected a problem matching ${pattern}, got:\n${found.join("\n") || "(none)"}`);

test("the kernel as it is has no problem: the core does not depend on contextual ranking, which is pure, reads two Contracts and names no capability", () => {
  assert.deepEqual(problems(), []);
});

// ---- K1: the core does not depend on contextual ranking ---------------------------------------------------------------------
test("K1: the package entry may re-export contextual names by name, and nothing else may: with no allowance the entry's re-export is reported", () => {
  assert.deepEqual(problems(ENTRY_WITH_NAME, ALLOW_INDEX), []);
  failsWith(problems(ENTRY_WITH_NAME, NO_ENTRY), /index\.ts:1 K1: the kernel core re-exports contextual ranking, and only a file listed in entryReexports may: "\.\/contextual\.js"/);
});
test("K1: a core file that imports contextual ranking is reported, in every way of importing it", () => {
  failsWith(problems(prepend(SERVICE, 'import { planContextualLayout } from "./contextual.js";')), /action-service\.ts:1 K1: the kernel core loads contextual ranking \(import\): "\.\/contextual\.js"/);
  failsWith(problems(prepend(SERVICE, 'import type { PlanInput } from "./contextual.js";')), /action-service\.ts:1 K1: .*loads contextual ranking \(import\)/);
  failsWith(problems(prepend(OFFERS, 'import "./contextual.js";')), /subject-offer-choices\.ts:1 K1: .*loads contextual ranking/);
  failsWith(problems(append(SERVICE, 'export const later = () => import("./contextual.js");')), /action-service\.ts:\d+ K1: .*loads contextual ranking \(dynamic\)/);
  failsWith(problems(append(SERVICE, 'export type Plan = import("./contextual.js").PlanInput;')), /action-service\.ts:\d+ K1: .*loads contextual ranking \(import-type\)/);
  failsWith(problems({ [`${KERNEL}target-lookup.ts`]: 'export { contextualDigest } from "./contextual.js";\n' }, ALLOW_INDEX), /target-lookup\.ts:1 K1: .*only a file listed in entryReexports may/);
});
test("K1: taking a contextual name from a core file that re-exports it is the same dependency by the back door", () => {
  failsWith(problems({ ...ENTRY_WITH_NAME, ...prepend(SERVICE, 'import { planContextualLayout } from "./index.js";') }, ALLOW_INDEX),
    /action-service\.ts:1 K1: the kernel core takes "planContextualLayout" from index\.ts, which re-exports contextual ranking/);
  failsWith(problems({ ...ENTRY_WITH_NAME, ...prepend(SERVICE, 'import { planContextualLayout as plan } from "./index.js";') }, ALLOW_INDEX), /takes "planContextualLayout" from index\.ts/);
  failsWith(problems({ ...ENTRY_WITH_NAME, ...prepend(SERVICE, 'import * as kernel from "./index.js";') }, ALLOW_INDEX), /action-service\.ts:1 K1: the kernel core takes the whole of index\.ts/);
  failsWith(problems({ ...ENTRY_WITH_NAME, ...append(OFFERS, 'export { planContextualLayout } from "./index.js";') }, ALLOW_INDEX), /subject-offer-choices\.ts:\d+ K1: .*takes "planContextualLayout" from index\.ts/);
  failsWith(problems({ ...ENTRY_WITH_NAME, ...append(OFFERS, 'export * from "./index.js";') }, ALLOW_INDEX), /subject-offer-choices\.ts:\d+ K1: .*takes the whole of index\.ts/);
  // The names the core really takes from the entry (CapabilityRegistry) are not contextual and stay free.
  assert.deepEqual(problems(ENTRY_WITH_NAME, ALLOW_INDEX), []);
});
test("K1: `export *` of contextual ranking is never allowed, not even by the entry, because it lists no names", () => {
  failsWith(problems({ [INDEX]: `${real[INDEX]}\nexport * from "./contextual.js";\n` }, ALLOW_INDEX), /index\.ts:\d+ K1: the kernel core re-exports contextual ranking with `export \*`/);
  failsWith(problems({ [INDEX]: `${real[INDEX]}\nexport * as contextual from "./contextual.js";\n` }, ALLOW_INDEX), /index\.ts:\d+ K1: .*with `export \*`/);
});

// ---- K2: only contextual ranking reads Contracts services ------------------------------------------------------------------
test("K2: the core reads no Contracts service, and contextual ranking reads only services/contextual", () => {
  failsWith(problems(prepend(OFFERS, 'import type { ContextualCandidate } from "@molis-ai/molis-work-contracts/services/contextual";')),
    /subject-offer-choices\.ts:1 K2: the kernel reads "@molis-ai\/molis-work-contracts\/services\/contextual"; only contextual ranking reads a Contracts service/);
  failsWith(problems({ [`${KERNEL}target-lookup.ts`]: 'import type { MemoryRecord } from "@molis-ai/molis-work-contracts/services/memory";\nexport type Lookup = MemoryRecord;\n' }),
    /target-lookup\.ts:1 K2: the kernel reads "@molis-ai\/molis-work-contracts\/services\/memory"/);
  failsWith(problems(prepend(CONTEXTUAL, 'import type { MemoryRecord } from "@molis-ai/molis-work-contracts/services/memory";')), /contextual\.ts:1 K2: .*services\/memory/);
  assert.deepEqual(problems({ [`${KERNEL}target-lookup.ts`]: 'import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";\nexport type Lookup = ActionView;\n' }), []);
});

// ---- K3: what contextual ranking reads ----------------------------------------------------------------------------------------
test("K3: contextual ranking reads nothing outside two Contracts, node:crypto and kernel files, and not the package entry", () => {
  failsWith(problems(prepend(CONTEXTUAL, 'import { readFileSync } from "node:fs";')), /contextual\.ts:1 K3: contextual ranking reads "node:fs"; it may read only/);
  failsWith(problems(prepend(CONTEXTUAL, 'import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";')), /contextual\.ts:1 K3: .*reads "@molis-ai\/molis-work-storage"/);
  failsWith(problems(prepend(CONTEXTUAL, 'import { runAgent } from "@molis-ai/molis-work-service-agent-host";')), /K3: .*reads "@molis-ai\/molis-work-service-agent-host"/);
  failsWith(problems(prepend(CONTEXTUAL, 'import { CapabilityRegistry } from "./index.js";')), /contextual\.ts:1 K3: contextual ranking imports the package entry \("\.\/index\.js"\), which re-exports it/);
  failsWith(problems(prepend(CONTEXTUAL, 'import { thing } from "../../contracts/src/platform/actions.js";')), /contextual\.ts:1 K3: .*"\.\.\/\.\.\/contracts\/src\/platform\/actions\.js", which is outside packages\/kernel\/src/);
  failsWith(problems(append(CONTEXTUAL, 'export const later = (name: string) => import(name);')), /contextual\.ts:\d+ K3: .*makes a dynamic import K3 cannot read/);
  failsWith(problems(append(CONTEXTUAL, 'export const sync = () => require("node:fs");')), /contextual\.ts:\d+ K3: contextual ranking reads "node:fs"/);
  assert.ok(CONTEXTUAL_PACKAGES.has("node:crypto"));
});
test("K3: contextual ranking may import any other kernel file, including a core file added later", () => {
  assert.deepEqual(problems({
    [`${KERNEL}target-lookup.ts`]: 'export const sameProvider = (a: string, b: string) => a === b;\n',
    ...prepend(CONTEXTUAL, 'import { sameProvider } from "./target-lookup.js";\nimport { subjectOfferChoices } from "./subject-offer-choices.js";\nexport const same = sameProvider;'),
  }), []);
});

// ---- K4: contextual ranking is pure ---------------------------------------------------------------------------------------------
test("K4: a module-level let, a clock, a timer, randomness or a module-level Map in contextual ranking is reported", () => {
  failsWith(problems(append(CONTEXTUAL, "let counter = 0;\nexport const next = () => ++counter;")), /contextual\.ts K4: contextual ranking is pure but has 1 module-level mutable state/);
  failsWith(problems(append(CONTEXTUAL, "export const at = () => Date.now();")), /contextual\.ts K4: .*1 effect\(s\)/);
  failsWith(problems(append(CONTEXTUAL, "export const later = () => setTimeout(() => undefined, 5);")), /contextual\.ts K4: .*effect\(s\)/);
  failsWith(problems(append(CONTEXTUAL, "export const roll = () => Math.random();")), /contextual\.ts K4: .*effect\(s\)/);
  failsWith(problems(append(CONTEXTUAL, "const cache = new Map<string, number>();\nexport const size = () => cache.size;")), /contextual\.ts K4: .*module-level mutable state/);
  failsWith(problems(append(CONTEXTUAL, "const seen: string[] = [];\nexport const note = (key: string) => { seen.push(key); };")), /contextual\.ts K4: .*module-level mutable state/);
});
test("K4: the same constructs in the core are not this rule's business (action-service.ts keeps its timers)", () => {
  assert.deepEqual(problems(append(OFFERS, "export const at = () => Date.now();")), []);
  assert.deepEqual(problems(append(SERVICE, "let counter = 0;\nexport const next = () => ++counter;")), []);
});

// ---- K5: directory-derived code names no capability -------------------------------------------------------------------------------
test("K5: a capability id, an owner id or a plugin package written as a string in contextual ranking or in subject-offer-choices.ts is reported", () => {
  failsWith(problems(append(CONTEXTUAL, 'export const DISCARD = "pages.discard";')), /contextual\.ts:\d+ K5: "pages\.discard" looks like a capability id/);
  failsWith(problems(append(CONTEXTUAL, 'export const RECALL = "memory.recall";')), /contextual\.ts:\d+ K5: "memory\.recall"/);
  failsWith(problems(append(CONTEXTUAL, 'export const OWNER = "io.molis.work.pages";')), /contextual\.ts:\d+ K5: "io\.molis\.work\.pages"/);
  failsWith(problems(append(CONTEXTUAL, 'export const PLUGIN = "@molis-ai/molis-work-plugin-pages";')), /contextual\.ts:\d+ K5: "@molis-ai\/molis-work-plugin-pages"/);
  failsWith(problems(append(CONTEXTUAL, "export const FIXED = `pages.discard`;")), /contextual\.ts:\d+ K5: "pages\.discard"/);
  failsWith(problems(append(CONTEXTUAL, "export const built = (name: string) => `pages.discard.${name}`;")), /contextual\.ts:\d+ K5: "pages\.discard\."/);
  failsWith(problems(append(OFFERS, 'export const ONE = ["goals.items.confirm"];')), /subject-offer-choices\.ts:\d+ K5: "goals\.items\.confirm"/);
  failsWith(problems(append(OFFERS, 'export const second = new ActionError("actions.offer_invalid", "pages.discard");')), /subject-offer-choices\.ts:\d+ K5: "pages\.discard"/);
  failsWith(problems(append(OFFERS, 'export const reason = { reason: "pages.discard" };')), /subject-offer-choices\.ts:\d+ K5: "pages\.discard"/);
});
test("K5: the kernel's own error codes, module paths, string types and prose are not capabilities", () => {
  assert.deepEqual(problems(append(OFFERS, [
    'export const failure = new ActionError("actions.offer_invalid", "推荐选项必须固定原提供方");',
    'export const view = { available: false, code: "actions.missing", reason: "原执行能力尚未注册" };',
    'export const quoted = { "code": "actions.subject_incompatible" };',
    'export type Kind = "pages.discard" | "memory.recall";',
    'export type Loaded = import("@molis-ai/molis-work-contracts/platform/actions").ActionView;',
  ].join("\n"))), []);
  assert.deepEqual(problems(append(CONTEXTUAL, ['export const KEY = "frag." + "x";', 'export const NOTE = "e.g. 请先确认。";', 'export const PATH = "../subject-offer-choices.js";'].join("\n"))), []);
  // The core outside the two files may name capabilities in its own error handling (action-service.ts does); K5 reads only the directory-derived files.
  assert.deepEqual(problems(append(SERVICE, 'export const MISSING = "actions.missing";\nexport const INFO = "goals.items.confirm";')), []);
});

// ---- the rule is by directory, not by file name ---------------------------------------------------------------------------------
test("splitting contextual.ts into a contextual/ directory passes, and the rules follow the files into it", () => {
  const split: Changes = {
    [CONTEXTUAL]: null,
    [`${KERNEL}contextual/candidates.ts`]: 'import { subjectOfferChoices } from "../subject-offer-choices.js";\nimport { actionEffect } from "@molis-ai/molis-work-contracts/platform/actions";\nexport const candidates = () => [subjectOfferChoices, actionEffect];\n',
    [`${KERNEL}contextual/policy.ts`]: 'import { candidates } from "./candidates.js";\nimport { createHash } from "node:crypto";\nexport const policy = () => [candidates, createHash];\n',
    [INDEX]: real[INDEX]!.replace(/export \{\n  CONTEXTUAL_THRESHOLDS[\s\S]*?\} from "\.\/contextual\.js";\n/, 'export { policy } from "./contextual/policy.js";\n'),
  };
  assert.notEqual(split[INDEX], real[INDEX], "the sample must replace the entry's re-export");
  assert.deepEqual(problems(split), []);
  failsWith(problems({ ...split, ...prepend(SERVICE, 'import { policy } from "./contextual/policy.js";') }), /action-service\.ts:1 K1: .*loads contextual ranking \(import\): "\.\/contextual\/policy\.js"/);
  failsWith(problems({ ...split, ...prepend(`${KERNEL}contextual/policy.ts`, 'import { readFileSync } from "node:fs";') }), /contextual\/policy\.ts:1 K3: .*"node:fs"/);
  failsWith(problems({ ...split, ...append(`${KERNEL}contextual/candidates.ts`, "let seen = 0;") }), /contextual\/candidates\.ts K4: .*mutable state/);
  failsWith(problems({ ...split, ...append(`${KERNEL}contextual/candidates.ts`, 'export const ID = "pages.discard";') }), /contextual\/candidates\.ts:\d+ K5: "pages\.discard"/);
  failsWith(problems({ ...split, ...prepend(`${KERNEL}contextual/candidates.ts`, 'import { CapabilityRegistry } from "../index.js";') }), /contextual\/candidates\.ts:1 K3: .*package entry/);
});
test("a tree with no kernel, and files that are not TypeScript sources of the kernel, are not looked at", () => {
  assert.deepEqual(kernelContextualProblems({ files: ["apps/local-host/src/host.ts"], read: () => 'import "@molis-ai/molis-work-storage";' }), []);
  assert.deepEqual(problems({ [`${KERNEL}notes.md`]: "import './contextual.js'", "packages/kernel/dist/index.js": 'import "./contextual.js";\n', "packages/kernel/test/x.ts": 'let a = "pages.discard";' }), []);
});

// ---- the wiring into pnpm health:check (scripts/check-health-gates.mjs), on a scratch repository -------------------------------------
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";
const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-kernel-contextual-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("packages/kernel/package.json", JSON.stringify({ name: "@fx/kernel" }, null, 2) + "\n");
  put(INDEX, 'export class CapabilityRegistry {}\nexport { planContextualLayout } from "./contextual.js";\n');
  put(SERVICE, 'import { CapabilityRegistry } from "./index.js";\nexport const registry = () => new CapabilityRegistry();\n');
  put(OFFERS, 'import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";\nexport const refuse = () => new ActionError("actions.offer_invalid", "no");\n');
  put(CONTEXTUAL, 'import { createHash } from "node:crypto";\nexport const planContextualLayout = (text: string) => createHash("sha256").update(text).digest("hex");\n');
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

test("health:check on a clean kernel passes", () => {
  git("checkout", "-q", "-f", "main");
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});
test("health:check fails when the kernel core imports contextual ranking, and rewriting baseline.json does not help", () => {
  branch("core-imports-contextual", () => {
    put(SERVICE, 'import { planContextualLayout } from "./contextual.js";\nexport const registry = () => planContextualLayout("x");\n');
    put("tooling/gates/baseline.json", "{}\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 1, run.out);
  assert.match(run.out, /packages\/kernel\/src\/action-service\.ts:1 K1: the kernel core loads contextual ranking \(import\): "\.\/contextual\.js"/);
});
test("health:check fails when contextual ranking reads a timer or a capability id, and passes again when the change is taken back", () => {
  branch("contextual-impure", () => put(CONTEXTUAL, `${readFileSync(path.join(repo, CONTEXTUAL), "utf8")}export const later = () => setTimeout(() => "pages.discard", 5);\n`));
  const run = gate("--base", "main");
  assert.equal(run.code, 1, run.out);
  assert.match(run.out, /packages\/kernel\/src\/contextual\.ts K4: contextual ranking is pure/);
  branch("contextual-clean", () => undefined);
  assert.equal(gate("--base", "main").code, 0);
});
