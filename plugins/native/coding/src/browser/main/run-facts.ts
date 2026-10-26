import { codingUsageSummary } from "../../usage.js";
import { el } from "../dom.js";
import { terminal } from "./composer-state.js";
import { phaseRing } from "./helpers.js";
import { status } from "./request.js";
import type { Page } from "./page.js";
import type { FrozenSetup, RunView } from "./shapes.js";

type Fact = readonly [label: string, value: string];

/** What a round was set up with: each part it used is a line, and what it did not use is named once. */
function factsOf(page: Page, run: RunView): { values: Fact[]; unused: string[] } {
  const { L } = page, f: FrozenSetup = run.frozen, values: Fact[] = [[L("coding.facts.model"), f.model_id], [L("coding.facts.usage"), codingUsageSummary(run.usage, L)], [L("coding.facts.scope"), f.directory?.canonical_path || L("coding.facts.no-directory")]], unused: string[] = [];
  const joiner = L("coding.list.joiner");
  if (f.subagent_workspaces?.length) values.push([L("coding.facts.subagent-dirs"), f.subagent_workspaces.map(item => item.directory.canonical_path).join(L("coding.list.semicolon"))]);
  values.push([L("coding.facts.role"), f.role_id + " · v" + f.role_version]);
  if (f.skills.length) values.push([L("coding.facts.methods"), f.skills.map(method => L(method.name) + " · v" + method.version).join(joiner)]);
  else unused.push(L("coding.attach.method"));
  if ((f.action_tools || []).length) values.push([L("coding.facts.actions"), (f.action_tools || []).map(ref => ref.capability_id + " · v" + ref.version + " · " + ref.provider_id).join(joiner)]);
  else unused.push(L("coding.attach.actions"));
  if (f.mcp_tools?.length) values.push([L("coding.facts.mcp"), f.mcp_tools.map(tool => (tool.server_label || tool.server) + " / " + tool.tool + " · " + L("coding.facts.configuration", { version: tool.configuration_version ?? L("coding.facts.not-recorded") }) + " · " + tool.version).join(joiner)]);
  else unused.push("MCP");
  if ((f.mcp_sources || []).length) values.push([L("coding.facts.mcp-sources"), (f.mcp_sources || []).map(source => (source.server_label || source.server) + " · " + L("coding.facts.configuration", { version: source.configuration_version })).join(joiner)]);
  else unused.push(L("coding.facts.mcp-source-kind"));
  if (f.character) values.push([L("coding.facts.character"), f.character.title + " · v" + f.character.reference.version], [L("coding.facts.host-tools"), f.host_tools?.join(joiner) || L("coding.facts.no-host-tools")]);
  else unused.push("Character");
  if (f.text_materials.length) values.push([L("coding.facts.materials"), f.text_materials.map(material => material.title || material.source_artifact_id).join(joiner)]);
  else unused.push(L("coding.attach.material"));
  if (f.compaction) values.push([L("coding.facts.compaction"), L("coding.facts.compaction-value", { tokens: f.compaction.above_tokens, version: f.compaction.version })]);
  if (!run.usage.compaction && run.activity.some(item => item.name === "上下文整理")) values.push([L("coding.facts.usage-scope"), L("coding.facts.usage-scope-value")]);
  return { values, unused };
}

/** The facts panel: the round's state, then one line per fact. */
function drawFacts(page: Page, result: HTMLElement, run: RunView, count: number, facts: { values: Fact[]; unused: string[] }) {
  const { L, s } = page, phaseLabel = s.phases[run.phase] || run.phase;
  const tone = run.phase === "completed" ? "done" : run.phase === "failed" ? "failed" : terminal(run.phase) ? "idle" : "live";
  const head = el("header", "", "coding-facts-head"), phase = el("span", phaseLabel, "coding-facts-phase"), list = el("dl");
  phase.dataset.tone = tone;
  phase.dataset.mwState = phaseRing(run.phase);
  head.append(el("h3", L("coding.results.facts")), phase, el("span", L("coding.turn.number", { number: count }), "coding-facts-round"));
  for (const [label, value] of facts.values) {
    list.append(el("dt", label), el("dd", value, label === L("coding.facts.scope") || label === L("coding.facts.subagent-dirs") ? "is-path" : ""));
  }
  result.replaceChildren(head, list);
  if (facts.unused.length) result.append(el("p", L("coding.facts.unused", { what: facts.unused.join(L("coding.list.joiner")) }), "coding-facts-unused"));
}

/** The results panel's facts of the latest round; with no round it says there is nothing yet. */
export function renderFacts(page: Page, all: readonly RunView[]) {
  const { L, q, s } = page, result = q("[data-coding-result]"), run = s.lastRun;
  if (!run) {
    result.textContent = L("coding.facts.empty");
    delete result.dataset.content;
    if (s.statusKey !== "idle") {
      s.statusKey = "idle";
      status(page, "");
    }
    return;
  }
  const facts = factsOf(page, run), key = JSON.stringify([all.length, s.phases[run.phase] || run.phase, facts.values, facts.unused]);
  if (result.dataset.content !== key) {
    drawFacts(page, result, run, all.length, facts);
    result.dataset.content = key;
  }
  const next = run.ref.run_id + ":" + run.phase + ":" + run.stop_reason;
  // The round's own footer shows its live state and outcome; this line only carries a failure worth reading twice.
  if (s.statusKey !== next) {
    s.statusKey = next;
    status(page, run.phase === "failed" ? run.stop_reason || s.phases.failed || "" : "", run.phase === "failed");
  }
}
