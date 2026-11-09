import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * Settings › 诊断 › “助理与执行服务”: the execution runtime's own account of its assembly, and the Assistant's latest
 * rounds with the exact identities and versions they ran with. For developers; the conversation never shows these.
 */
export function renderAgentDiagnostics({ }: { L(text: string): string }): string {
  return `<details class="settings-section prompt-diagnostics" id="agent-diagnostics" data-agent-diagnostics>
      <summary><strong>${uiText("workbench.settings-agent-diagnostics.assistant-execution-service")}</strong><span class="settings-muted">${uiText("workbench.settings-agent-diagnostics.what-execution-service-actually-assembled-which-local-capabiliti")}</span></summary>
      <div data-agent-diagnostics-body><p class="settings-muted mw-loading">${uiText("workbench.settings-agent-diagnostics.loading")}</p></div>
    </details>`;
}

/** Reads only when opened. No template interpolation inside. */
export const AGENT_DIAGNOSTICS_CLIENT_SCRIPT = String.raw`
globalThis.molisWorkBindAgentDiagnostics = (container = document) => {
  const root = container.matches?.("[data-agent-diagnostics]") ? container : container.querySelector?.("[data-agent-diagnostics]");
  if (!root || root.dataset.agentDiagnosticsBound) return;
  root.dataset.agentDiagnosticsBound = "1";
  const L = globalThis.L || ((text) => text);
  const body = root.querySelector("[data-agent-diagnostics-body]");
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  // An identifier, shown exactly and breakable so a long one never widens the page.
  const code = (text) => { const node = el("code", "", String(text)); node.style.wordBreak = "break-all"; return node; };
  const line = (...parts) => { const node = el("span", "settings-muted"); parts.forEach((part) => node.append(typeof part === "string" ? document.createTextNode(part) : part)); return node; };
  const issue = (text, level) => el("li", "prompt-diagnostics-issue prompt-diagnostics-issue--" + (level || "warning"), text);
  const SLOT = { ready: "workbench.settings-agent-diagnostics.ready", disabled: "workbench.settings-agent-diagnostics.switched-off", unavailable: "workbench.settings-agent-diagnostics.unavailable" };
  const HOST = { absent: "workbench.settings-agent-diagnostics.none-2", unavailable: "workbench.settings-agent-diagnostics.unavailable", undetermined: "workbench.settings-agent-diagnostics.couldn-t-be-determined-treated-none" };
  const PHASE = { starting: "workbench.settings-agent-diagnostics.starting", running: "workbench.settings-agent-diagnostics.progress", "awaiting-review": "workbench.settings-agent-diagnostics.needs-approval", "awaiting-input": "workbench.settings-agent-diagnostics.needs-answer", paused: "workbench.settings-agent-diagnostics.paused", compacting: "workbench.settings-agent-diagnostics.compacting-context",
    completed: "common.control.done", failed: "workbench.settings-agent-diagnostics.failed", cancelled: "workbench.settings-agent-diagnostics.cancelled", stopped: "workbench.settings-agent-diagnostics.stopped", "reconcile-required": "workbench.settings-agent-diagnostics.review-outcome", unknown: "workbench.settings-agent-diagnostics.not-readable-runtime" };
  const PHASE_RING = { starting:"running",running:"running","awaiting-review":"approval","awaiting-input":"answer",paused:"paused",compacting:"running",completed:"round-ended",failed:"failed",cancelled:"cancelled",stopped:"stopped","reconcile-required":"verify",unknown:"verify" };
  const MATERIAL = { selection: "workbench.settings-agent-diagnostics.selection", object: "workbench.settings-agent-diagnostics.object", text: "workbench.settings-agent-diagnostics.text", file: "workbench.settings-agent-diagnostics.file", image: "workbench.settings-agent-diagnostics.images", capability: "workbench.settings-agent-diagnostics.specified-capability", method: "workbench.settings-agent-diagnostics.method" };
  const LAYER = { base: "workbench.settings-agent-diagnostics.product-rules", role: "workbench.settings-agent-diagnostics.role", project: "workbench.settings-agent-diagnostics.project", task: "workbench.settings-agent-diagnostics.task" };
  const time = (iso) => { const date = new Date(iso); return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(iso || ""); };

  const runtimePart = (runtime) => {
    const section = el("section");
    section.append(el("h3", "prompt-diagnostics-heading", globalThis.t.text("workbench.settings-agent-diagnostics.execution-service")));
    if (!runtime) { section.append(el("p", "settings-muted", globalThis.t.text("workbench.settings-agent-diagnostics.current-execution-service-provided-no-assembly-record"))); return section; }
    const list = el("ul", "prompt-diagnostics-list");
    const head = el("li", "prompt-diagnostics-owner");
    head.append(el("strong", "", runtime.app.app_id + " " + runtime.app.app_version), line(globalThis.t.text("workbench.settings-agent-diagnostics.status") + " " + runtime.state + " · " + globalThis.t.text("workbench.settings-agent-diagnostics.assembly-fingerprint") + " ", code(runtime.fingerprint)));
    list.append(head);
    const slots = el("li", "prompt-diagnostics-owner");
    slots.append(el("strong", "", globalThis.t.text("workbench.settings-agent-diagnostics.assembly-slots")));
    const slotList = el("ul", "prompt-diagnostics-issues");
    runtime.slots.forEach((slot) => {
      const words = slot.slot + "：" + globalThis.t.text(SLOT[slot.state] || slot.state) + (slot.implementation ? " · " + slot.implementation + (slot.version ? " " + slot.version : "") : "")
        + (slot.fallback ? " · " + globalThis.t.text("workbench.settings-agent-diagnostics.using-fallback-implementation") : "") + (slot.why ? " · " + slot.why : "");
      const status = issue(words, slot.state === "ready" ? "info" : "warning"); status.dataset.mwState = slot.state; slotList.append(status);
    });
    slots.append(slotList);
    list.append(slots);
    const host = el("li", "prompt-diagnostics-owner");
    host.append(el("strong", "", globalThis.t.text("workbench.settings-agent-diagnostics.local-capabilities")), line(globalThis.t.text("workbench.settings-agent-diagnostics.present") + "：" + (runtime.host.effective.join("、") || globalThis.t.text("workbench.settings-agent-diagnostics.none"))));
    if (runtime.host.not_present.length) {
      const missing = el("ul", "prompt-diagnostics-issues");
      runtime.host.not_present.forEach((item) => missing.append(issue(item.capability + "：" + globalThis.t.text(HOST[item.state] || item.state)
        + (runtime.host.requested.includes(item.capability) ? " · " + globalThis.t.text("workbench.settings-agent-diagnostics.requested-app") : ""), runtime.host.requested.includes(item.capability) ? "warning" : "info")));
      host.append(missing);
    }
    list.append(host);
    const ledger = el("li", "prompt-diagnostics-owner");
    ledger.append(el("strong", "", globalThis.t.text("workbench.settings-agent-diagnostics.runs-that-weren-t-recorded")));
    if (!runtime.ledger_failures.length) ledger.append(line(globalThis.t.text("workbench.settings-agent-diagnostics.none-every-turn-can-be-replayed-after-restart")));
    else {
      const failures = el("ul", "prompt-diagnostics-issues");
      runtime.ledger_failures.forEach((entry) => failures.append(issue(entry.kind + " #" + entry.seq + (entry.code ? " · " + entry.code : "") + (entry.detail ? " · " + entry.detail : ""))));
      ledger.append(line(globalThis.t.text("workbench.settings-agent-diagnostics.these-runs-can-t-be-replayed-after-restart")), failures);
    }
    list.append(ledger);
    section.append(list);
    return section;
  };

  const roundItem = (round) => {
    const item = el("li", "prompt-diagnostics-owner");
    const status = line(globalThis.t.text(PHASE[round.phase] || round.phase) + (round.stop_reason ? " · " + round.stop_reason : "")); status.dataset.mwState = PHASE_RING[round.phase] || "verify";
    item.append(el("strong", "", (round.work_title || globalThis.t.text("workbench.settings-agent-diagnostics.deleted-work")) + " · " + time(round.started_at)),
      status,
      line(globalThis.t.text("workbench.settings-agent-diagnostics.runtime") + " ", code(round.run_id), " · " + globalThis.t.text("workbench.settings-agent-diagnostics.session") + " ", code(round.session_id || "—"), " · " + globalThis.t.text("workbench.settings-agent-diagnostics.work") + " ", code(round.work_id),
        round.project_id ? " · " + globalThis.t.text("workbench.settings-agent-diagnostics.project") + " " : "", round.project_id ? code(round.project_id) : ""));
    const frozen = round.frozen;
    if (frozen) {
      item.append(line(globalThis.t.text("workbench.settings-agent-diagnostics.model") + " ", code(frozen.model_id), " · " + globalThis.t.text("workbench.settings-agent-diagnostics.role") + " ", code(frozen.role.id + " v" + frozen.role.version), " · " + globalThis.t.text("workbench.settings-agent-diagnostics.execute") + " " + frozen.execution
        + (frozen.character ? " · Character " + frozen.character.title + "（" + frozen.character.artifact_id + " v" + frozen.character.version + "）" : "")
        + (frozen.history === "digest" ? " · " + globalThis.t.text("workbench.settings-agent-diagnostics.earlier-turns-summarized") : "") + (frozen.thinking ? " · " + globalThis.t.text("workbench.settings-agent-diagnostics.thinking") + " " + frozen.thinking : "")));
      if (frozen.prompts.length) item.append(line(globalThis.t.text("workbench.settings-agent-diagnostics.prompts") + "：" + frozen.prompts.map((prompt) => prompt.prompt_id + " v" + prompt.version + "（" + globalThis.t.text(LAYER[prompt.layer] || prompt.layer)
        + (prompt.user_revision !== undefined ? "，" + globalThis.t.text("workbench.settings-agent-diagnostics.version") + " #" + prompt.user_revision : "") + "）").join("、")));
    } else item.append(line(globalThis.t.text("workbench.settings-agent-diagnostics.runtime-no-longer-holds-record-when-turn-started")));
    if (round.materials.length) item.append(line(globalThis.t.text("workbench.settings-agent-diagnostics.materials") + "：" + round.materials.map((material) => material.title + "（" + globalThis.t.text(MATERIAL[material.kind] || material.kind) + "，"
      + (material.explicit ? globalThis.t.text("workbench.settings-agent-diagnostics.added") : globalThis.t.text("workbench.settings-agent-diagnostics.page")) + (material.draft ? "，" + globalThis.t.text("workbench.settings-agent-diagnostics.unsaved-edits") : "")
      + (material.object ? "，" + material.object.kind + ":" + material.object.id + (material.object.version !== undefined && material.object.version !== null ? "@" + material.object.version : "") : "")
      + (material.capability ? "，" + material.capability.capability_id + " v" + material.capability.version : "") + (material.method ? "，" + material.method.method_id : "") + "）").join("、")));
    if (round.usage) item.append(line(globalThis.t.text("workbench.settings-agent-diagnostics.usage") + "：" + globalThis.t.text("workbench.settings-agent-diagnostics.inputs") + " " + round.usage.input.toLocaleString() + " · " + globalThis.t.text("workbench.settings-agent-diagnostics.output") + " " + round.usage.output.toLocaleString()
      + (round.usage.cached_input ? " · " + globalThis.t.text("workbench.settings-agent-diagnostics.cached-reads") + " " + round.usage.cached_input.toLocaleString() : "")));
    if (round.failures.length) {
      const failures = el("ul", "prompt-diagnostics-issues");
      // The runtime's summary often opens with the tool's name again: shown once. Its own words follow when the summary
      // alone only names a generic code: the developer needs which rule refused the call, not just its error kind.
      round.failures.forEach((failure) => failures.append(issue(failure.tool + (failure.target ? " · " + failure.target : "") + (failure.state === "unknown" ? " · " + globalThis.t.text("workbench.settings-agent-diagnostics.outcome-unknown") : "") + "："
        + (failure.summary.startsWith(failure.tool + " · ") ? failure.summary.slice(failure.tool.length + 3) : failure.summary)
        + (failure.detail && !failure.summary.includes(failure.detail) ? " · " + failure.detail : ""))));
      item.append(failures);
    }
    return item;
  };

  const load = async () => {
    if (root.dataset.loaded) return;
    root.dataset.loaded = "1";
    try {
      const data = await molisWorkRequest("/api/assistant/diagnostics");
      const rounds = el("section");
      rounds.append(el("h3", "prompt-diagnostics-heading", globalThis.t.text("workbench.settings-agent-diagnostics.recent-assistant-turns")));
      if (!data.rounds.length) rounds.append(el("p", "settings-muted", globalThis.t.text("workbench.settings-agent-diagnostics.no-assistant-turns-last-7-days")));
      else { const list = el("ul", "prompt-diagnostics-list"); data.rounds.forEach((round) => list.append(roundItem(round))); rounds.append(list); }
      body.replaceChildren(runtimePart(data.runtime), rounds);
    } catch (failure) { delete root.dataset.loaded; const note = el("p", "settings-form-error"); molisWorkRequest.show(note, failure); body.replaceChildren(note); }
  };
  root.addEventListener("toggle", () => { if (root.open) load(); });
  if (location.hash === "#agent-diagnostics") { root.open = true; load(); }
};
globalThis.molisWorkBindAgentDiagnostics(document);
`;
