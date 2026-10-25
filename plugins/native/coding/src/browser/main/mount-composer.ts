import { codingDraft } from "../draft.js";
import { composerModels } from "../composer-model.js";
import { cooperationClient } from "../cooperation.js";
import { inputReceipts } from "../input-receipts.js";
import { stepReports } from "../steps.js";
import { subagentCards } from "../subagent-cards.js";
import { usageMeter } from "../usage-meter.js";
import { writerIntegration } from "../writer-integration.js";
import { controls } from "./controls.js";
import { refreshState } from "./configuration.js";
import { terminal } from "./composer-state.js";
import { draftKey, showReviews } from "./helpers.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";
import { select } from "./select.js";

/** Puts words in the composer for the person to send or change; text already there stays, with the new words after it. */
function prefill(page: Page, text: string, keep: boolean) {
  const { input } = page;
  const next = keep && input.value.trim() ? input.value + "\n\n" + text : text;
  if (input.value === next) { input.focus(); return; }
  input.value = next;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

/** The composer's draft: what is typed and what the next round is given, saved to the session. */
function mountDraft(page: Page) {
  const { input, s } = page;
  page.refs.draft = codingDraft({
    ...s.ports, input, key: id => draftKey(page, id),
    choices: {
      action_tools: s.actionSelections, character: s.characterSelections, character_skill_ids: s.characterSkills, configuration: s.configurations, materials: s.materialSelections,
      mcp_sources: s.mcpSourceSelections, mcp_tools: s.mcpSelections, methods: s.methodSelections, question_drafts: s.questionDrafts,
    },
  });
}

/** The round's side of the page: reports of a step, the subagents' cards, the usage meter and the model controls. */
function mountRoundParts(page: Page) {
  const { L, host, lifetime, q, refs, root, s } = page;
  refs.integrations = writerIntegration({ lifetime, translate: L, q, api: s.ports.api, reviews: (box, workspace) => host.showReviews?.(box, [], null, workspace), status: s.ports.status });
  refs.stepReports = stepReports({ ...s.ports, prepareRework: reason => refs.plans.prepareStepRework(reason), receipts: host.receipts });
  refs.subagentCards = subagentCards({
    ...s.ports, timeline: refs.timeline, roleName: id => s.ROLE_NAMES[id] || id || "Agent", showReviews: (container, found, sid) => showReviews(page, container, found, sid),
    sessionId: () => s.runtimeSessionId, parentLive: run => !terminal(run.phase), prefill: text => prefill(page, text, true),
    openInPanel: childId => {
      root.dataset.codingResults = "true";
      const row = root.querySelector<HTMLDetailsElement>('[data-coding-subagents] details[data-child="' + CSS.escape(childId) + '"]');
      if (!row) return;
      row.open = true;
      row.scrollIntoView({ block: "center" });
      row.querySelector("textarea")?.focus({ preventScroll: true });
    },
  });
  refs.usageMeter = usageMeter(s.ports);
  refs.composerModels = composerModels({
    q, lifetime, translate: L, status: s.ports.status,
    switchModel: (run, model) => api(page, sessionPath(s.current) + "/control", "POST", { kind: "switch-model", run_id: run.ref.run_id, ...model }).then(() => readCurrent(page)),
  });
}

/** The session's cooperation (mail, background commands) and the receipts of the words sent to a round under way. */
function mountCooperation(page: Page) {
  const { L, host, input, q, refs, root, s } = page;
  refs.cooperationUi = cooperationClient({
    ...s.ports,
    openSession: (id, title) => { host.openItem("coding", id, title || ""); return select(page, id); },
    refreshSessions: () => refreshState(page),
    openArtifact: (reference, title) => host.openItem("coding", reference.artifact_id, title || reference.artifact_id),
    rounds: () => s.allRuns.map((run, index) => ({ run_id: run.ref.run_id, number: index + 1, phase: run.phase })),
    prefill: text => prefill(page, text, false),
    // The Host attached a taken delivery to the session's materials; the page's selection follows, or the next send would drop it.
    materialsChanged: async () => {
      const id = s.current, data = await api<{ materials?: unknown[] }>(page, "/sessions/" + encodeURIComponent(id) + "?window=1");
      if (id !== s.current) return;
      s.materialSelections.set(id, data.materials || []);
      controls(page);
    },
  });
  refs.inputReceipts = inputReceipts({
    api: s.ports.api, translate: L, q, refresh: s.ports.refresh, find: <Found extends Element = HTMLElement>(selector: string) => root.querySelector<Found>(selector), receipts: host.receipts,
    landed: (sent, said) => {
      if (s.current === sent.id && input.value === sent.text) {
        input.value = "";
        window.molisFit?.(input);
        if (refs.draft.local(sent.id) === sent.text) void refs.draft.save(sent.id, "");
      }
      status(page, said);
    },
  });
}

/** Makes the composer's side of the page: the draft first (the others save through it), then the round's parts and the cooperation. */
export function mountComposerParts(page: Page) {
  mountDraft(page);
  mountRoundParts(page);
  mountCooperation(page);
}
