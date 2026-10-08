import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { AgentBuilderWorkflow, type AgentBuilderPorts, type CatalogEntry } from "@molis-ai/molis-work-plugin-builder";
import { assertContract } from "@molis-ai/molis-work-plugin-sandbox";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { BuilderAgentRecord, BuilderAgentRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { entryDigest, entryFromRunRecord, loadCorpus, type ReplayEntry } from "../scripts/studio-replay/corpus.mjs";
import { CATALOG_MISS, LIVE_ENTRY_IDS, builtinEntries, compare, parseBaseline, replayEntry, summarise } from "../scripts/studio-replay/replay.mjs";
import { runSmoke } from "../scripts/studio-replay/smoke.mjs";
import { standInAnswers } from "../scripts/studio-replay/stand-in.mjs";

// specs/repository-anti-corruption §4.14 (W1-12): the studio Skill replay. Recorded designer answers go through the host's
// design checks and are compared with a committed baseline; a generation smoke runs the same studio workflow against a real
// model on an isolated Home. Each rule here is mutation-verified on scratch copies: break one thing, the command fails.
const root = fileURLToPath(new URL("..", import.meta.url));
const corpusDirectory = path.join(root, "tests/fixtures/studio-replay"), proposalsFixture = path.join(root, "tests/fixtures/builder-designer/minimax-notes-v1.json");
const scratch = mkdtempSync(path.join(tmpdir(), "molis-studio-replay-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const cli = (args: string[], env: Record<string, string | undefined> = {}) => {
  const run = spawnSync(process.execPath, ["--import", "tsx", path.join(root, "scripts/studio-replay.mts"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, MOLIS_WORK_SECRET_BACKEND: "file", ...env } });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const committed = () => { const loaded = loadCorpus([path.join(corpusDirectory, "corpus.json"), proposalsFixture]); return [...builtinEntries(), ...loaded.entries]; };

// ---------------------------------------------------------------------------------------------------------------------
// The committed corpus and baseline

test("the committed corpus replays exactly as its baseline records, and every synthetic refusal is the one it was written for", () => {
  const entries = committed(), results = entries.map(entry => replayEntry(entry));
  const baseline = parseBaseline(readFileSync(path.join(corpusDirectory, "baseline.json"), "utf8"), "baseline.json");
  const comparison = compare(results, baseline);
  assert.deepEqual(comparison, { regressions: [], removed: [], changed: [], unrecorded: [], behind: [], reasonChanged: [] }, "every answer still gets the result, and the reason, the baseline recorded");
  for (const entry of entries) {
    const result = results.find(item => item.id === entry.id)!;
    if (entry.expectFailure) { assert.equal(result.pass, false, `${entry.id} is meant to be refused`); assert.match(result.message!, new RegExp(entry.expectFailure), `${entry.id} is refused for its own reason`); }
    else if (entry.origin === "synthetic") assert.equal(result.pass, true, `${entry.id}: ${result.message}`);
  }
  assert.ok(entries.filter(entry => entry.origin === "recorded").length >= 3, "the real MiniMax answers of tests/fixtures/builder-designer are part of the corpus");
  const loaded = loadCorpus([path.join(corpusDirectory, "corpus.json"), proposalsFixture]);
  assert.deepEqual(loaded.merged, [], "a committed corpus repeats no entry: merging identical records is for a Home's run history, not for the files we keep");
  assert.deepEqual(loaded.skipped, []);
});

test("the committed corpus is a seed: it holds no real full-design answer, and the default report says so and says what is pending", () => {
  // This is the fact the doc and the report state plainly. If a real detail answer is ever committed, this test is the place that changes, together with the doc's §2.2.
  assert.equal(committed().filter(entry => entry.origin === "recorded" && entry.mode !== "propose").length, 0, "no real detail or revise answer is committed");
  assert.equal(committed().filter(entry => entry.origin === "recorded").length, 3, "the real answers are the 3 first proposals of builder-designer/minimax-notes-v1.json");
  const result = cli([]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /no recorded detail answers in this corpus\. The committed corpus is a seed/);
  assert.match(result.out, /share of full designs accepted first time, is NOT measured here/);
  assert.match(result.out, /pending a user decision, to be recorded in\s+specs\/repository-anti-corruption\/spec\.md §1/);
  assert.doesNotMatch(cli(["--corpus", path.join(corpusDirectory, "smoke-briefs.json")]).out, /committed corpus is a seed/, "a corpus of one's own is not called the seed");
});

test("the prompt example is replayed from the prompt itself, so a prompt edit that breaks it fails here", () => {
  const [example] = builtinEntries();
  assert.equal(example!.id, "prompt-example");
  assert.equal(replayEntry(example!).pass, true);
  assert.equal(replayEntry({ ...example!, answer: example!.answer.slice(0, 200) }).pass, false);
});

test("a refusal is grouped by its kind, not by the names and numbers in it", () => {
  const summary = summarise(committed().map(entry => replayEntry(entry)));
  const parse = summary.reasons.find(reason => reason.stage === "parse")!;
  assert.deepEqual(parse.ids.sort(), ["detail-notes-truncated", "minimax-notes-v1#3"], "two cut-off answers, cut at different characters, are one kind of refusal");
  assert.equal(summary.total, summary.groups.reduce((sum, group) => sum + group.total, 0) + summary.repairRounds.total);
});

// ---------------------------------------------------------------------------------------------------------------------
// The replay's checks are the workflow's checks

const memoryStorage = (): PluginPrivateStorage => {
  const values = new Map<string, string>();
  return { get: key => values.get(key) ?? null, set: (key, value) => { values.set(key, value); }, delete: key => values.delete(key),
    compareAndSet: (key, expected, value) => { if ((values.get(key) ?? null) !== expected) return false; values.set(key, value); return true; } };
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const sketch = (id: string, title: string, base: { description: string; rationale: string; journey: string[] }) => ({ description: base.description, rationale: base.rationale, journey: base.journey, id, title,
  operations: [{ id: "notes.list", kind: "query", description: "列出", input: {}, output: [{ id: "string", text: "string" }] }, { id: "notes.add", kind: "command", description: "添加", input: { text: "string(1..200) 笔记" }, output: { id: "string" } }],
  pages: [{ id: "home", title, parts: [{ id: "editor", intent: "input", purpose: "写", uses: "notes.add" }, { id: "notes", intent: "collection", purpose: "看", uses: "notes.list" }] }] });

/** What the real workflow does with one recorded answer: accepted, or the reason it sent back to the designer. */
async function throughWorkflow(entry: ReplayEntry): Promise<{ accepted: boolean; refusal?: string }> {
  const detailAnswer = loadCorpus([path.join(corpusDirectory, "corpus.json")]).entries.find(item => item.id === "detail-notes-plain")!.answer;
  const base = entry.base ?? { id: "quick", title: "快记", description: "d", rationale: "r", journey: ["写", "看"] };
  const proposals = JSON.stringify({ summary: "s", candidates: [sketch(base.id, base.title, base), sketch("other", base.title + "二", base)] });
  // The scripted designer: what each stage is given, in order. Anything after the answer under test is the repair request we read.
  const script: Array<{ mode: string; answer: string }> = [];
  if (entry.mode === "propose" && entry.clarificationAllowed === false) script.push({ mode: "propose", answer: JSON.stringify({ questions: ["q"], summary: "" }) });
  if (entry.mode === "propose") script.push({ mode: "propose", answer: entry.answer });
  else { script.push({ mode: "propose", answer: proposals }, { mode: "detail", answer: entry.mode === "revise" ? detailAnswer : entry.answer }); if (entry.mode === "revise") script.push({ mode: "revise", answer: entry.answer }); }
  const requests: BuilderAgentRequest[] = [];
  const record = (request: BuilderAgentRequest, output: string): BuilderAgentRecord => ({ id: crypto.randomUUID(), role: request.role, promptVersion: request.promptVersion, contractRevision: request.contractRevision,
    instruction: request.instruction, input: request.task, output, configuredModel: "m", reportedModels: [], phase: "completed", startedAt: new Date().toISOString(), activity: [], usage: [] });
  const catalog: CatalogEntry[] = entry.capabilities.map(item => ({ id: item.id, description: "", ...(item.execution ? { execution: item.execution } : {}) }) as CatalogEntry);
  const ports = {
    projectId: "p", catalog: async () => catalog, models: async () => [], validateContract: (contract: unknown) => assertContract(contract),
    agent: async () => ({ async close() {}, async records() { return []; }, async run(request: BuilderAgentRequest) {
      if (request.role !== "designer") throw new Error("design only");
      requests.push(request);
      const next = script.shift();
      if (!next) throw new Error("script exhausted");
      return record(request, next.answer);
    } }),
    prepareBuild: async () => scratch, check: async () => { throw new Error("design only"); }, call: async () => [], resetPreview: async () => {},
    browserAcceptance: async () => { throw new Error("design only"); }, publish: async () => { throw new Error("design only"); }, installations: async () => [], lifecycle: async () => {},
  } as unknown as AgentBuilderPorts;
  const workflow = new AgentBuilderWorkflow(memoryStorage(), ports);
  try {
    const created = workflow.create("brief");
    const target = entry.mode;
    const tasks = () => requests.map(request => JSON.parse(request.task) as { mode: string; repair?: { validationError: string } });
    let clarified = false, revised = false;
    for (let tick = 0; tick < 2000; tick++) {
      const build = workflow.store.require(created.id), seen = tasks();
      const repairs = seen.filter(task => task.mode === target && task.repair);
      if (repairs.length) return { accepted: false, refusal: repairs[0]!.repair!.validationError };
      if (build.phase === "clarifying" && !build.active && entry.clarificationAllowed === false && !clarified) { clarified = true; await workflow.action(created.id, { action: "message", message: "a" }); }
      else if (build.phase === "choosing" && !build.active && target !== "propose" && !build.chosen) await workflow.action(created.id, { action: "choose", revision: build.revision, candidateId: base.id });
      if (target === "propose" && (build.phase === "choosing" || (build.phase === "clarifying" && entry.clarificationAllowed !== false)) && !build.active && seen.length) return { accepted: true };
      if (target === "detail" && build.design && seen.some(task => task.mode === "detail")) return { accepted: true };
      if (target === "revise") {
        if (build.design && !build.active && !revised) { revised = true; await workflow.action(created.id, { action: "message", message: "改一下" }); }
        else if (revised && build.design && seen.some(task => task.mode === "revise") && !build.active && build.history.length) return { accepted: true };
      }
      await sleep(5);
    }
    const last = workflow.store.require(created.id);
    throw new Error(`the workflow did not settle for ${entry.id}: ${last.phase} ${last.error ?? ""} after ${tasks().map(task => task.mode + (task.repair ? "+repair(" + task.repair.validationError.slice(0, 120) + ")" : "")).join(", ")}`);
  } finally { await workflow.close(); }
}

test("the replay accepts and refuses exactly what the studio workflow does, with the same words", async () => {
  const entries = committed();
  assert.ok(entries.some(entry => entry.mode === "propose") && entries.some(entry => entry.mode === "detail") && entries.some(entry => entry.mode === "revise"), "all three stages are compared");
  for (const entry of entries) {
    const replayed = replayEntry(entry), real = await throughWorkflow(entry);
    assert.equal(replayed.pass, real.accepted, `${entry.id}: replay says ${replayed.pass ? "accepted" : "refused (" + replayed.message + ")"}, the workflow says ${real.accepted ? "accepted" : "refused (" + real.refusal + ")"}`);
    if (!replayed.pass) assert.equal(replayed.message, real.refusal, `${entry.id}: the workflow sends the designer back with the replay's words`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The command: each rule fails on a scratch copy that breaks it

const make = (name: string) => {
  const directory = path.join(scratch, name), corpus = path.join(directory, "corpus");
  mkdirSync(corpus, { recursive: true });
  cpSync(path.join(corpusDirectory, "corpus.json"), path.join(corpus, "corpus.json")); cpSync(proposalsFixture, path.join(corpus, "minimax-notes-v1.json"));
  const baseline = path.join(directory, "baseline.json");
  assert.equal(cli(["--corpus", corpus, "--baseline", baseline, "--write-baseline"]).code, 0);
  const run = (...extra: string[]) => cli(["--corpus", corpus, "--baseline", baseline, ...extra]);
  const edit = (change: (entries: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) => {
    const file = path.join(corpus, "corpus.json"), json = JSON.parse(readFileSync(file, "utf8")) as { entries: Array<Record<string, unknown>> };
    writeFileSync(file, JSON.stringify({ ...json, entries: change(json.entries) }, null, 2));
  };
  const editBaseline = (change: (value: { entries: Record<string, { pass: boolean; reason?: string; digest?: string; live?: boolean }>; retired?: Record<string, string> }) => void) => {
    const value = JSON.parse(readFileSync(baseline, "utf8")); change(value); writeFileSync(baseline, JSON.stringify(value, null, 2));
  };
  return { directory, corpus, baseline, run, edit, editBaseline };
};

const gitIn = (directory: string) => (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=replay", "-c", "user.email=replay@example.invalid", ...args], { cwd: directory, encoding: "utf8", stdio: "pipe" });

/** A scratch repository around a made corpus, with its baseline committed on `main`. */
const repository = (name: string, prepare: (made: ReturnType<typeof make>) => void = () => {}) => {
  const made = make(name);
  prepare(made);
  const git = gitIn(made.directory);
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-q", "-m", "base");
  const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
  return { ...made, git, commit };
};

test("unchanged, the command holds and prints the pass rates and why answers were refused", () => {
  const { run } = make("pristine");
  const result = run("--verbose");
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /First answers accepted without a repair round/);
  assert.match(result.out, /recorded propose\s+1\/3/);
  assert.match(result.out, /Why the host refused answers/);
  assert.match(result.out, /every recorded result still holds/);
  assert.match(result.out, /cannot say what that does to a model|Scope: fixed recorded answers prove the host checks/);
});

test("an answer the host used to accept and now refuses fails the command, naming the entry and the host's words", () => {
  const { run, edit } = make("regression");
  edit(entries => entries.map(entry => entry.id === "detail-notes-plain" ? { ...entry, answerJson: undefined, answer: JSON.stringify(entry.answerJson).replace('"notes.add"', '"notes.append"') } : entry));
  const result = run();
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /detail-notes-plain: passed, now refused at expand: .*notes\.append/);
});

test("an entry that passed cannot leave the corpus unannounced; retiring it needs a reason", () => {
  const { run, edit, editBaseline } = make("removed");
  edit(entries => entries.filter(entry => entry.id !== "detail-notes-plain"));
  const gone = run();
  assert.equal(gone.code, 1, gone.out);
  assert.match(gone.out, /detail-notes-plain: no longer in the corpus/);
  editBaseline(value => { value.retired = { "detail-notes-plain": "" }; });
  assert.equal(run().code, 2, "a retirement without a reason is not a baseline");
  editBaseline(value => { value.retired = { "detail-notes-plain": "replaced by detail-notes-think-and-fence" }; delete value.entries["detail-notes-plain"]; });
  assert.equal(run().code, 0, "a retirement that says why is accepted");
});

test("an entry the baseline has not seen fails until it is recorded", () => {
  const { run, edit, corpus, baseline } = make("unrecorded");
  edit(entries => [...entries, { ...entries.find(entry => entry.id === "detail-notes-plain")!, id: "detail-notes-again" }]);
  const result = run();
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /detail-notes-again: not in the baseline/);
  assert.equal(cli(["--corpus", corpus, "--baseline", baseline, "--write-baseline"]).code, 0);
  assert.equal(run().code, 0, "recording it is how it joins");
});

test("a refused answer the host now accepts fails until the baseline keeps the gain", () => {
  // The baseline says the host refused this answer; today the host accepts it, as it would after a fix to the host.
  const { run, editBaseline, corpus, baseline } = make("behind");
  editBaseline(value => { value.entries["detail-notes-plain"] = { pass: false, reason: "细化方案：有 # 处要一起改", digest: value.entries["detail-notes-plain"]!.digest! }; });
  const result = run();
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /detail-notes-plain: refused before, accepted now/);
  assert.equal(cli(["--corpus", corpus, "--baseline", baseline, "--write-baseline"]).code, 0);
  assert.equal(run().code, 0);
  assert.equal(JSON.parse(readFileSync(baseline, "utf8")).entries["detail-notes-plain"].pass, true, "the gain is kept");
});

test("writing the baseline never forgives a loss", () => {
  const { edit, corpus, baseline } = make("launder-local");
  edit(entries => entries.map(entry => entry.id === "detail-notes-plain" ? { ...entry, answerJson: undefined, answer: "{" } : entry));
  const result = cli(["--corpus", corpus, "--baseline", baseline, "--write-baseline"]);
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /Refusing to write the baseline over a loss/);
  assert.equal(JSON.parse(readFileSync(baseline, "utf8")).entries["detail-notes-plain"].pass, true, "the baseline file is untouched");
});

test("a baseline edited by hand to forgive a regression passes locally but not against the merge-base", () => {
  // The host once accepted this answer: the baseline at the base says so, and the corpus is untouched. Today the host refuses it.
  const { corpus, baseline, run, editBaseline, git } = repository("launder-base", made => made.editBaseline(value => { value.entries["detail-broken-references"] = { pass: true, digest: value.entries["detail-broken-references"]!.digest! }; }));
  git("checkout", "-q", "-b", "launder");
  const visible = run();
  assert.equal(visible.code, 1, visible.out);
  assert.match(visible.out, /detail-broken-references: passed, now refused at expand/);
  editBaseline(value => { value.entries["detail-broken-references"] = { pass: false, reason: "细化方案：有 # 处要一起改", digest: value.entries["detail-broken-references"]!.digest! }; });
  const local = run();
  assert.equal(local.code, 0, "rewriting the baseline silences the local check; " + local.out);
  const against = run("--base", "main");
  assert.equal(against.code, 1, against.out);
  assert.match(against.out, /detail-broken-references \(it passed at the base\): passed, now refused/);
  assert.equal(cli(["--corpus", corpus, "--baseline", baseline, "--base", "no-such-ref"]).code, 2, "a base that is not a commit is an error, not a pass");
});

test("--base reads the baseline at the merge-base, not at the tip of the ref: a branch behind main is not failed for what main added since", () => {
  const { corpus, baseline, run, edit, git, commit } = repository("behind-main");
  const fork = git("rev-parse", "HEAD").trim();
  git("checkout", "-q", "-b", "work"); commit("work: a change that has nothing to do with the corpus");
  git("checkout", "-q", "main");
  edit(entries => [...entries, { ...entries.find(entry => entry.id === "detail-notes-plain")!, id: "detail-notes-added-on-main" }]);
  assert.equal(cli(["--corpus", corpus, "--baseline", baseline, "--write-baseline"]).code, 0);
  commit("main: a corpus entry that passes, and its baseline row");
  git("checkout", "-q", "work");
  const behind = run("--base", "main");
  assert.equal(behind.code, 0, "work has not seen the entry main added after the fork, and is not asked to have it: " + behind.out);
  assert.match(behind.out, new RegExp(`also against the merge-base with main, ${fork.slice(0, 8)}`), "the report names the commit it read");
  assert.equal(run("--base", fork).code, 0, "the merge-base itself reads the same baseline");
  git("checkout", "-q", "main");
  assert.equal(run("--base", "main").code, 0, "and main against itself holds");
});

test("--base asks the merge-base's tree whether the baseline is there: a baseline that is not there yet is a first comparison with a warning, any other failure stops the command", () => {
  const first = make("first-baseline"), git = gitIn(first.directory);
  git("init", "-q", "-b", "main"); git("add", "corpus"); git("commit", "-q", "-m", "corpus only");
  git("checkout", "-q", "-b", "adds-baseline"); git("add", "baseline.json"); git("commit", "-q", "-m", "the baseline");
  const adds = first.run("--base", "main");
  assert.equal(adds.code, 0, adds.out);
  assert.match(adds.out, /\(the merge-base with main, [0-9a-f]{8}, has no baseline yet\)/);
  assert.match(adds.out, /\nWARNING: the merge-base with main \([0-9a-f]{8}\) has no baseline at \S*baseline\.json, so only the baseline in this tree was compared\..*the record at the merge-base is NOT being checked/, "said before the verdict, not buried in the label");
  // The baseline is at the merge-base but its tree cannot be read: not "no baseline yet" (a localized git, a damaged object store).
  const { run, git: other, directory } = repository("unreadable-base");
  other("checkout", "-q", "-b", "work");
  const tree = other("rev-parse", "main^{tree}").trim();
  rmSync(path.join(directory, ".git", "objects", tree.slice(0, 2), tree.slice(2)), { force: true });
  const broken = run("--base", "main");
  assert.equal(broken.code, 2, broken.out);
  assert.match(broken.out, /could not look for .*baseline\.json in the merge-base with main/);
  assert.doesNotMatch(broken.out, /has no baseline yet|WARNING/, "an unreadable base is an error, never a skipped comparison");
});

test("an answer rewritten under the same id fails, whether or not it still passes; the baseline cannot be told to accept it", () => {
  const { corpus, baseline, run, edit, editBaseline, git } = repository("rewrite-answer");
  git("checkout", "-q", "-b", "rewrite");
  // The move the review reproduced: every operation renamed in a design that is still valid, so it keeps passing.
  edit(entries => entries.map(entry => entry.id === "detail-notes-plain" ? { ...entry, answerJson: JSON.parse(JSON.stringify(entry.answerJson).replaceAll("notes.add", "notes.create")) } : entry));
  const local = run();
  assert.equal(local.code, 1, local.out);
  assert.match(local.out, /detail-notes-plain: its answer, or what it was given, is not the one recorded/);
  assert.match(local.out, /list the old id under "retired" with the reason/);
  const write = cli(["--corpus", corpus, "--baseline", baseline, "--write-baseline"]);
  assert.equal(write.code, 1, "writing the baseline does not accept it either: " + write.out);
  assert.match(write.out, /Refusing to write the baseline over a loss[\s\S]*detail-notes-plain: its answer/);
  const digest = entryDigest(loadCorpus([corpus]).entries.find(entry => entry.id === "detail-notes-plain")!);
  editBaseline(value => { value.entries["detail-notes-plain"]!.digest = digest; });
  assert.equal(run().code, 0, "a baseline edited to match the new answer silences the local check");
  const against = run("--base", "main");
  assert.equal(against.code, 1, against.out);
  assert.match(against.out, /detail-notes-plain: its answer, or what it was given, is not the one recorded/, "the merge-base's record of the answer still stands");
});

test("a refused entry, the guard that proves the host still refuses a broken design, cannot be deleted from the corpus and the baseline together", () => {
  const { run, edit, editBaseline, git } = repository("delete-guard");
  git("checkout", "-q", "-b", "delete");
  edit(entries => entries.filter(entry => entry.id !== "detail-broken-references"));
  editBaseline(value => { delete value.entries["detail-broken-references"]; });
  assert.equal(run().code, 0, "deleting the entry from both files leaves nothing for the local check to compare");
  const against = run("--base", "main");
  assert.equal(against.code, 1, against.out);
  assert.match(against.out, /detail-broken-references \(at the base\): no longer in the corpus \(it was refused\)/);
  editBaseline(value => { value.retired = { "detail-broken-references": "the rule it guarded moved to the host's own tests" }; });
  assert.equal(run("--base", "main").code, 0, "retiring it with a reason is the way out");
});

test("a changed answer takes a new id and retires the old one with a reason; a retired id is not used again", () => {
  const { corpus, baseline, run, edit, editBaseline, git } = repository("retire-and-replace");
  git("checkout", "-q", "-b", "replace");
  edit(entries => entries.map(entry => entry.id === "detail-notes-plain" ? { ...entry, id: "detail-notes-plain-v2", answerJson: JSON.parse(JSON.stringify(entry.answerJson).replaceAll("notes.add", "notes.create")) } : entry));
  const open = run("--base", "main");
  assert.equal(open.code, 1, open.out);
  assert.match(open.out, /detail-notes-plain: no longer in the corpus[\s\S]*detail-notes-plain-v2: not in the baseline/);
  editBaseline(value => { delete value.entries["detail-notes-plain"]; value.retired = { "detail-notes-plain": "operations renamed; replaced by detail-notes-plain-v2" }; });
  assert.equal(cli(["--corpus", corpus, "--baseline", baseline, "--write-baseline"]).code, 0, "the new id is recorded, the retirement kept");
  assert.equal(JSON.parse(readFileSync(baseline, "utf8")).retired["detail-notes-plain"], "operations renamed; replaced by detail-notes-plain-v2");
  assert.equal(run("--base", "main").code, 0, run("--base", "main").out);
  edit(entries => [...entries, { ...entries.find(entry => entry.id === "detail-notes-plain-v2")!, id: "detail-notes-plain" }]);
  const reused = run();
  assert.equal(reused.code, 1, reused.out);
  assert.match(reused.out, /detail-notes-plain: retired \(operations renamed.*\) but back in the corpus/);
});

test("a baseline row without the digest of its answer is not a baseline, and a digest tells the answer from the words about it", () => {
  const { run, editBaseline } = make("no-digest");
  editBaseline(value => { delete value.entries["detail-notes-plain"]!.digest; });
  const bare = run();
  assert.equal(bare.code, 2, bare.out);
  assert.match(bare.out, /entry detail-notes-plain needs the digest of its answer/);
  const entry = loadCorpus([path.join(corpusDirectory, "corpus.json")]).entries.find(item => item.id === "detail-notes-plain")!;
  assert.equal(entryDigest({ ...entry, note: "another sentence", source: "somewhere else" }), entryDigest(entry), "words about the entry are not the entry");
  for (const changed of [{ answer: entry.answer + " " }, { origin: "recorded" as const }, { attempt: 1 }, { capabilities: [{ id: "x" }] }, { base: { ...entry.base!, title: "other" } }, { expectFailure: "x" }])
    assert.notEqual(entryDigest({ ...entry, ...changed }), entryDigest(entry), `${Object.keys(changed)[0]} is part of the entry`);
});

test("`live` is for the prompt example only: marking a corpus answer live is not a baseline, so its answer cannot be rewritten under the same id", () => {
  // The move the review reproduced. Step 1: swap the digest of an answer for `live`; the answer is unchanged, so nothing looks wrong.
  const { run, edit, editBaseline, git, commit } = repository("live-bypass");
  git("checkout", "-q", "-b", "live-bypass");
  editBaseline(value => { delete value.entries["detail-notes-plain"]!.digest; value.entries["detail-notes-plain"]!.live = true; });
  for (const result of [run(), run("--base", "main")]) {
    assert.equal(result.code, 2, "a live row for a corpus answer is not a baseline: " + result.out);
    assert.match(result.out, /entry detail-notes-plain cannot be recorded as live: only prompt-example is read from the code itself/);
  }
  // Step 2, had step 1 been merged: rewrite the answer (a valid design, so it still passes). Still refused, locally and against the base.
  commit("step 1: the digest of an answer swapped for live");
  edit(entries => entries.map(entry => entry.id === "detail-notes-plain" ? { ...entry, answerJson: JSON.parse(JSON.stringify(entry.answerJson).replaceAll("notes.add", "notes.create")) } : entry));
  for (const result of [run(), run("--base", "main"), run("--base", "HEAD")]) assert.equal(result.code, 2, result.out);
  // The prompt example, the one answer with no fixed text, is still recorded as live and still holds.
  const baseline = JSON.parse(readFileSync(path.join(scratch, "live-bypass", "baseline.json"), "utf8"));
  assert.equal(baseline.entries["prompt-example"].live, true);
  assert.deepEqual([...LIVE_ENTRY_IDS], builtinEntries().map(entry => entry.id), "the ids a baseline may record as live are exactly the ones the code reads itself");
  assert.ok(builtinEntries().every(entry => entry.live), "and every one of them is read from the code");
});

test("a live baseline row cannot vouch for a fixed answer in the corpus either: the comparison counts it as changed", () => {
  // Whatever path a live row for a fixed answer took into the baseline (here handed to `compare` directly), the replay's own digest refuses it.
  const results = committed().map(entry => replayEntry(entry)), digest = results.find(result => result.id === "detail-notes-plain")!.digest!;
  const recorded = parseBaseline(readFileSync(path.join(corpusDirectory, "baseline.json"), "utf8"), "baseline.json");
  const row = { pass: true, live: true as const };
  assert.deepEqual(compare(results, recorded).changed, []);
  const laundered = { ...recorded, entries: { ...recorded.entries, "detail-notes-plain": row } };
  const here = compare(results, laundered);
  assert.equal(here.changed.length, 1, "the local check");
  assert.match(here.changed[0]!, /detail-notes-plain: the baseline records it as read from the code itself \(live\), but the corpus has a fixed answer under that id/);
  const atBase = compare(results, recorded, laundered);
  assert.equal(atBase.changed.length, 1, "and the merge-base's record");
  assert.match(atBase.changed[0]!, /detail-notes-plain: the baseline records it as read from the code itself/);
  assert.equal(compare(results, recorded, { ...recorded, entries: { ...recorded.entries, "detail-notes-plain": { pass: true, digest } } }).changed.length, 0, "a row with the right digest is fine");
  assert.deepEqual(compare(results, recorded).changed, [], "and the prompt example, live in the baseline and live in the replay, never trips this");
});

test("a Skill that no longer mounts fails the command; a Skill that changed is reported as outside what this replay can judge", () => {
  const { run } = make("skill");
  const copy = path.join(scratch, "skill-copy", "molis-plugin-dev");
  cpSync(path.join(root, "skills/molis-plugin-dev"), copy, { recursive: true });
  const chapter = path.join(copy, "generated-design.md"), original = readFileSync(chapter, "utf8");
  writeFileSync(chapter, original + "\n\n" + "多出来的一句话。".repeat(4000));
  const tooBig = run("--skill-dir", copy);
  assert.equal(tooBig.code, 1, tooBig.out);
  assert.match(tooBig.out, /Skill mount problems[\s\S]*超过 20000 字的挂载上限/);
  writeFileSync(chapter, original + "\n\n补一句话。\n");
  const changed = run("--skill-dir", copy);
  assert.equal(changed.code, 0, "a small Skill edit is not a failure of the fixed-answer replay: " + changed.out);
  assert.match(changed.out, /The mounted text changed since the baseline[\s\S]*Skill stage design: version \d+ → \d+/);
  assert.match(changed.out, /pnpm studio:replay smoke/, "and it says what to run instead");
});

test("--min-pass holds a corpus of one's own to a floor on the first answers of recorded runs", () => {
  const { corpus } = make("floor");
  const own = cli(["--corpus", corpus, "--min-pass", "0.9"]);
  assert.equal(own.code, 1, own.out);
  assert.match(own.out, /first-answer pass rate of recorded answers 33% is below --min-pass 0\.9/);
  assert.equal(cli(["--corpus", corpus, "--min-pass", "0.3"]).code, 0);
});

// ---------------------------------------------------------------------------------------------------------------------
// Harvesting a Home's own recorded runs

test("designer run records become corpus entries without the brief, and only the stages the replay checks", async () => {
  const runs = path.join(scratch, "runs", "build-1", "builder-runs");
  mkdirSync(runs, { recursive: true });
  const corpus = loadCorpus([path.join(corpusDirectory, "corpus.json")]).entries, valid = corpus.find(item => item.id === "detail-notes-plain")!.answer, revision = corpus.find(item => item.id === "revise-notes-with-rework")!.answer;
  const task = { mode: "detail", brief: "PRIVATE-BRIEF-WORDS", messages: [{ role: "user", text: "PRIVATE-BRIEF-WORDS" }], proposal: { id: "board", title: "笔记板", description: "d", rationale: "r", journey: ["写"], operations: [], pages: [] },
    capabilities: [{ id: "model.generate", execution: { cost: "metered" }, input: { big: "schema" } }], moreCapabilities: [{ source: "目标", count: 3, examples: ["goals.list — 列出目标"] }], resources: [] };
  const run = (id: string, over: Record<string, unknown>) => writeFileSync(path.join(runs, id + ".json"), JSON.stringify({ id, role: "designer", promptVersion: "designer/3.7.0+molis-plugin-dev.design@1", contractRevision: "draft", instruction: "PRIVATE-INSTRUCTION",
    input: JSON.stringify(task), output: valid, configuredModel: "m", reportedModels: [], phase: "completed", startedAt: "2026-10-01T00:00:00Z", activity: [], usage: [], ...over }));
  run("aaaaaaaa", {});
  run("bbbbbbbb", { input: JSON.stringify({ ...task, repair: { previousAnswer: "x", validationError: "e" } }), output: valid.slice(0, 100) });
  // A revision's base is the design as it was recorded, which has no id or rationale of its own: the replay must still check the answer.
  const current = { title: "笔记板", description: "d", operations: [], parts: [], acceptance: [] };
  run("revise001", { input: JSON.stringify({ mode: "revise", brief: "PRIVATE-BRIEF-WORDS", request: "PRIVATE-REQUEST-WORDS", current, capabilities: [], resources: [] }), output: revision });
  run("cccccccc", { role: "coder" });
  run("dddddddd", { input: JSON.stringify({ ...task, mode: "experience" }) });
  run("eeeeeeee", { output: "", phase: "failed" });
  const out = path.join(scratch, "harvested", "corpus.json");
  const result = cli(["harvest", "--runs", path.join(scratch, "runs"), "--out", out]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /wrote 3 entries \(2 first answers\) to .*; merged 0 identical run records; skipped 3/);
  const text = readFileSync(out, "utf8"), entries = (JSON.parse(text) as { entries: ReplayEntry[] }).entries;
  assert.doesNotMatch(text, /PRIVATE-/, "neither the brief nor the instruction leaves the Home");
  assert.deepEqual(entries.map(entry => [entry.mode, entry.origin, entry.attempt]).sort(), [["detail", "recorded", 0], ["detail", "recorded", 1], ["revise", "recorded", 0]]);
  const detail = entries.find(entry => entry.mode === "detail" && entry.attempt === 0)!;
  assert.deepEqual(detail.capabilities.map(item => item.id).sort(), ["goals.list", "model.generate"], "capabilities come from the full list and from the summary the designer saw");
  assert.equal(detail.capabilities.find(item => item.id === "model.generate")?.execution?.cost, "metered");
  assert.ok(!JSON.stringify(entries).includes("big"), "schemas are not copied");
  const replayed = cli(["--corpus", out]);
  assert.equal(replayed.code, 0, replayed.out);
  assert.match(replayed.out, /recorded detail\s+1\/1/, "a harvested file replays; the repair-round answer is counted apart");
  assert.match(replayed.out, /recorded revise\s+1\/1/, "a revision replays against the design recorded with it");
  assert.match(replayed.out, /answers to repair requests: 0\/1 accepted/);
  assert.equal(typeof entryFromRunRecord({ role: "designer", input: "{", output: "x" }, "t"), "string", "an unreadable task is skipped with a reason, never guessed at");
  // The run-record shapes the harvest builds are checked by the same host code as the committed ones: the copy of the checks in the replay cannot drift on them unseen.
  assert.ok(entries.every(entry => entry.shownCatalogOnly === true), "an entry rebuilt from a run record says its action list is only what the designer was shown");
  for (const entry of entries) {
    const replayed = replayEntry(entry), real = await throughWorkflow(entry);
    assert.equal(replayed.pass, real.accepted, `${entry.id} (${entry.mode}, attempt ${entry.attempt}): replay ${replayed.pass ? "accepted" : "refused (" + replayed.message + ")"}, workflow ${real.accepted ? "accepted" : "refused (" + real.refusal + ")"}`);
    if (!replayed.pass) assert.equal(replayed.message, real.refusal, `${entry.id}: the same words`);
  }
});

/** A designer run record of the Agent host with the fields the replay reads. */
const designerRecord = (id: string, task: Record<string, unknown>, output: string, over: Record<string, unknown> = {}) => ({ id, role: "designer", promptVersion: "designer/3.7.0+molis-plugin-dev.design@1", contractRevision: "draft",
  instruction: "PRIVATE-INSTRUCTION", input: JSON.stringify(task), output, configuredModel: "m", reportedModels: [], phase: "completed", startedAt: "2026-10-01T00:00:00Z", activity: [], usage: [], ...over });
const writeRecords = (home: string, files: Record<string, unknown>) => { for (const [file, value] of Object.entries(files)) { const target = path.join(home, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(value)); } };
const committedEntry = (id: string) => loadCorpus([path.join(corpusDirectory, "corpus.json")]).entries.find(entry => entry.id === id)!;
const detailTask = (proposal: unknown, extra: Record<string, unknown> = {}) => ({ mode: "detail", brief: "PRIVATE-BRIEF", proposal, capabilities: [], moreCapabilities: [], resources: [], ...extra });

test("run records of one task and answer are one entry: the replay and the harvest merge them, say so and go on (a retried build keeps its runs twice)", () => {
  const home = path.join(scratch, "dup-home"), notes = committedEntry("detail-notes-plain"), task = detailTask(notes.base);
  writeRecords(home, {
    "b1/builder-runs/r1.json": designerRecord("r1", task, notes.answer),
    "b2/builder-runs/r2.json": designerRecord("r2", task, notes.answer, { configuredModel: "another", startedAt: "2026-10-02T00:00:00Z" }),
    "b2/builder-runs/r3.json": designerRecord("r3", task, notes.answer.slice(0, 80)),
  });
  const replayed = cli(["--corpus", home]);
  assert.equal(replayed.code, 0, "the command that prints a Home's pass rate does not stop on a repeated record: " + replayed.out);
  assert.match(replayed.out, /recorded detail\s+1\/2/, "the two copies are one answer, the cut-off one is another");
  assert.match(replayed.out, /Same task and answer met more than once, replayed once \(1\)\n\s+detail-[0-9a-f]{12}: .*r1\.json and .*r2\.json/);
  const out = path.join(scratch, "dup-harvest", "corpus.json"), harvested = cli(["harvest", "--runs", home, "--out", out]);
  assert.equal(harvested.code, 0, harvested.out);
  assert.match(harvested.out, /wrote 2 entries \(2 first answers\) to .*; merged 1 identical run records; skipped 0/, "the harvest merges them the same way");
  // The same entry in two corpus files is the same merge; the same id for two different answers is a mistake in a corpus and says where.
  const clash = path.join(scratch, "dup-clash"), entry = (JSON.parse(readFileSync(out, "utf8")) as { entries: Array<Record<string, unknown>> }).entries[0]!;
  mkdirSync(clash, { recursive: true });
  const corpus = (value: Record<string, unknown>) => JSON.stringify({ format: "studio-replay-corpus/1", entries: [value] });
  writeFileSync(path.join(clash, "a.json"), corpus(entry)); writeFileSync(path.join(clash, "b.json"), corpus({ ...entry, note: "a copy that only has another note" }));
  const copy = cli(["--corpus", clash]);
  assert.equal(copy.code, 0, copy.out);
  assert.match(copy.out, /Same task and answer met more than once, replayed once \(1\)/);
  writeFileSync(path.join(clash, "b.json"), corpus({ ...entry, answer: String(entry.answer) + " " }));
  const mistaken = cli(["--corpus", clash]);
  assert.equal(mistaken.code, 2, mistaken.out);
  assert.match(mistaken.out, /two corpus entries are called detail-[0-9a-f]{12} but are not the same answer \(.*a\.json and .*b\.json\)/);
  // A file in the Home's history that cannot be read is one more thing not replayed.
  if (process.getuid?.() !== 0) {
    const locked = path.join(home, "b2/builder-runs/locked.json");
    writeFileSync(locked, "{}"); chmodSync(locked, 0);
    try { const skipped = cli(["--corpus", home]); assert.equal(skipped.code, 0, skipped.out); assert.match(skipped.out, /locked\.json: could not be read/); }
    finally { chmodSync(locked, 0o600); }
  }
});

test("a refusal for an action the run record does not show is tagged and bounded, not counted as an ordinary refusal; with the action shown the same answer is accepted", () => {
  const home = path.join(scratch, "gap-home"), ask = committedEntry("detail-model-ask-then-add"), task = (extra: Record<string, unknown> = {}) => detailTask(ask.base, extra);
  writeRecords(home, {
    "b/builder-runs/shown.json": designerRecord("shown", task({ capabilities: [{ id: "model.generate", execution: ask.capabilities[0]!.execution, input: { big: "schema" } }] }), ask.answer),
    "b/builder-runs/summarised.json": designerRecord("summarised", task({ moreCapabilities: [{ source: "平台", count: 1, examples: ["model.generate — 模型"] }] }), ask.answer),
    "b/builder-runs/unseen.json": designerRecord("unseen", task(), ask.answer),
    "b/builder-runs/cut.json": designerRecord("cut", task({ capabilities: [{ id: "model.generate" }] }), ask.answer.slice(0, 100)),
  });
  const result = cli(["--corpus", home]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /recorded detail\s+2\/4\s+50%\s+\(1 of the 2 refused name an action the run record does not show; if the host accepted those, at most 75%\)/);
  assert.match(result.out, /Refused for an action the run record does not show[^\n]*\n\s+detail-[0-9a-f]{12} \[validate\]: 项目能力目录中没有：model\.generate\n(?!\s+detail)/, "the cut-off answer is not in that list, only the one that names an action nobody showed");
  assert.match(result.out, /4 of these answers were rebuilt from run records: their action list is what the designer was shown/);
  const floor = cli(["--corpus", home, "--min-pass", "0.9"]);
  assert.equal(floor.code, 1, floor.out);
  assert.match(floor.out, /50% is below --min-pass 0\.9 \(1 of the refusals name an action the run record does not show and count as refused here\)/, "a floor counts the tagged refusal as a refusal");
  assert.doesNotMatch(cli([]).out, /rebuilt from run records/, "nothing of the committed corpus was rebuilt from a run record");
});

test("the refusals the report tags as an action the run record does not show are the host's own words, at both stages that say them", async () => {
  const detail: ReplayEntry = { ...committedEntry("detail-model-ask-then-add"), capabilities: [] }, replayed = replayEntry(detail);
  assert.equal(replayed.pass, false);
  assert.match(replayed.message!, CATALOG_MISS, "validateAgentDesign: " + replayed.message);
  assert.equal((await throughWorkflow(detail)).refusal, replayed.message, "the workflow sends the designer back with those words");
  const first = committedEntry("propose-two-candidates"), value = JSON.parse(first.answer) as { candidates: Array<{ operations: Array<Record<string, unknown>> }> };
  value.candidates[0]!.operations[0]!.effects = { capabilities: ["goals.list"] };
  const propose: ReplayEntry = { ...first, id: "propose-unlisted-action", answer: JSON.stringify(value) }, refused = replayEntry(propose);
  assert.equal(refused.stage, "propose");
  assert.match(refused.message!, CATALOG_MISS, "the propose stage: " + refused.message);
  assert.equal((await throughWorkflow(propose)).refusal, refused.message);
  assert.equal(replayEntry({ ...detail, shownCatalogOnly: true }).catalogGap, true, "tagged when the list is only what the designer was shown");
  assert.equal(replayEntry(detail).catalogGap, undefined, "and never for an entry whose list is the whole directory");
  assert.equal(replayEntry({ ...committedEntry("detail-notes-plain"), answer: "{", shownCatalogOnly: true }).catalogGap, undefined, "or for a refusal that is about something else");
  assert.notEqual(entryDigest({ ...detail, shownCatalogOnly: true }), entryDigest(detail), "and the flag is part of what the baseline records of an entry");
});

// ---------------------------------------------------------------------------------------------------------------------
// The generation smoke

test("the smoke only runs on an isolated Home with the file secret store, and says how to run when it has no model", () => {
  const home = path.join(scratch, "smoke-home");
  const none = cli(["smoke"], { MOLIS_WORK_HOME: "" });
  assert.equal(none.code, 2, none.out);
  assert.match(none.out, /REFUSED: MOLIS_WORK_HOME is not set/);
  const fakeUser = path.join(scratch, "fake-user");
  const real = cli(["smoke"], { HOME: fakeUser, MOLIS_WORK_HOME: path.join(fakeUser, ".molis-work") });
  assert.equal(real.code, 2, real.out);
  assert.match(real.out, /REFUSED: MOLIS_WORK_HOME is the real Home/);
  // Nowhere inside the real Home (its tmp, a project directory), by symlink either, and not a directory that holds it.
  const inside = cli(["smoke"], { HOME: fakeUser, MOLIS_WORK_HOME: path.join(fakeUser, ".molis-work", "tmp") });
  assert.equal(inside.code, 2, inside.out);
  assert.match(inside.out, /REFUSED: MOLIS_WORK_HOME is the real Home or inside it/);
  const holder = cli(["smoke"], { HOME: fakeUser, MOLIS_WORK_HOME: fakeUser });
  assert.equal(holder.code, 2, holder.out);
  assert.match(holder.out, /REFUSED: MOLIS_WORK_HOME \(.*\) contains the real Home/);
  mkdirSync(path.join(fakeUser, ".molis-work"), { recursive: true });
  symlinkSync(path.join(fakeUser, ".molis-work"), path.join(scratch, "link-to-real-home"));
  const linked = cli(["smoke"], { HOME: fakeUser, MOLIS_WORK_HOME: path.join(scratch, "link-to-real-home", "later") });
  assert.equal(linked.code, 2, linked.out);
  assert.match(linked.out, /REFUSED: MOLIS_WORK_HOME is the real Home or inside it/);
  const keychain = cli(["smoke"], { MOLIS_WORK_HOME: home, MOLIS_WORK_SECRET_BACKEND: "keychain" });
  assert.equal(keychain.code, 2, keychain.out);
  assert.match(keychain.out, /MOLIS_WORK_SECRET_BACKEND must be "file"/);
  const skipped = cli(["smoke"], { MOLIS_WORK_HOME: home });
  assert.equal(skipped.code, 0, skipped.out);
  assert.match(skipped.out, /SKIP: the isolated Home .* has no enabled text model/);
  assert.match(skipped.out, /pnpm web --port .*\n.*设置 → 模型设置[\s\S]*pnpm studio:replay smoke/);
  assert.doesNotMatch(skipped.out, /REFUSED/);
});

test("the smoke wiring works end to end against a scripted local model: Home, model, Prologue agent, studio workflow, report", () => {
  const result = cli(["smoke", "--stand-in", "--minutes", "1"], { MOLIS_WORK_HOME: undefined });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /STAND-IN MODEL: .* not any Skill or prompt/);
  assert.match(result.out, /Generation smoke: 3\/3 briefs reached a frozen design with stand-in-model; 3 full designs accepted on the first answer; 0 repair rounds/);
  assert.match(result.out, /notes\s+designed\s+\d+s\s+propose first try, experience first try, detail first try/);
});

test("the smoke counts the designer's repair rounds, which is what a Skill edit is judged by", async () => {
  const answers = standInAnswers(path.join(corpusDirectory, "corpus.json")), detail = answers.detail as string;
  const requests: Array<{ mode: string; repair: boolean }> = [];
  // The first full design is cut off; the repair request gets the whole one.
  const script: Record<string, string[]> = { propose: [answers.propose as string], experience: [answers.experience as string], detail: [detail.slice(0, 120), detail] };
  const record = (request: BuilderAgentRequest, output: string): BuilderAgentRecord => ({ id: crypto.randomUUID(), role: request.role, promptVersion: request.promptVersion, contractRevision: request.contractRevision,
    instruction: request.instruction, input: request.task, output, configuredModel: "m", reportedModels: [], phase: "completed", startedAt: new Date().toISOString(), activity: [], usage: [] });
  const report = await runSmoke({ briefs: [{ id: "one", brief: "随手记" }], minutes: 1, pollMs: 5, model: { provider_id: "p", model_id: "m", label: "m" },
    agent: async () => ({ async close() {}, async records() { return []; }, async run(request: BuilderAgentRequest) {
      const task = JSON.parse(request.task) as { mode: string; repair?: unknown };
      requests.push({ mode: task.mode, repair: task.repair !== undefined });
      const queue = script[task.mode]; if (!queue) throw new Error("no answer for " + task.mode);
      return record(request, queue.length > 1 ? queue.shift()! : queue[0]!);
    } }) });
  const [one] = report.briefs;
  assert.equal(one!.outcome, "designed");
  assert.deepEqual(one!.repairRounds, { propose: 0, experience: 0, detail: 1 });
  assert.deepEqual(one!.firstTry, { propose: true, experience: true, detail: false });
  assert.match(one!.repairs[0]!, /^detail: .*JSON/, "the host's own words for the refusal are kept");
  assert.deepEqual(requests.map(item => item.mode + (item.repair ? "+repair" : "")), ["propose", "experience", "detail", "detail+repair"], "the code role and the UI stage never run");
  assert.deepEqual(report.summary, { briefs: 1, designed: 1, detailFirstTry: 0, repairRounds: 1 });
  assert.equal(Object.keys(report.skill.stages).length, 5);
});
