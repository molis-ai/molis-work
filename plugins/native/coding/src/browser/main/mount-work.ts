import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { codeLanguage, codeTokens, growCodeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { createCodingCodePaint } from "../../code-paint-client.js";
import { actionsClient } from "../actions.js";
import { changesetClient } from "../changeset.js";
import { characterChoice } from "../characters.js";
import { plansClient } from "../plans.js";
import { writerDirectories } from "../writers.js";
import { renderArtifacts } from "./artifacts.js";
import { refreshState, rememberConfiguration } from "./configuration.js";
import { controls } from "./controls.js";
import { returnFromChange } from "./goals.js";
import { paintDiffs } from "./code.js";
import { closeReport } from "./report.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";
import type { Page } from "./page.js";

/** The split of a directory into worktrees: who works where, and which directory the next round uses. */
function mountWriterDirectories(page: Page) {
  const { readText, host, lifetime, q, refs, s } = page;
  refs.writerDirectories = writerDirectories({
    lifetime, translate: readText, q, api: s.ports.api, reviews: (box, parent) => host.showReviews?.(box, [], null, parent), current: () => s.current, workspace: () => s.workspaceId,
    workspaceLabel: () => s.state.workspaces.find(item => item.workspace_id === s.workspaceId)?.canonical_path || s.workspaceId, status: s.ports.status,
    assignments: () => s.configurations.get(s.current)?.writer_assignments || [],
    saveAssignments: async (owner, parent, assignments) => {
      if (owner !== s.current || parent !== s.workspaceId) throw new Error(uiText.text("coding.error.split-changed"));
      rememberConfiguration(page);
      const previous = s.configurations.get(s.current);
      s.configurations.set(s.current, { ...previous, writer_assignments: assignments });
      try {
        await refs.draft.flush();
        status(page, uiText.text("coding.worktrees.split-saved"));
      } catch (error) {
        if (!lifetime.alive) return;
        s.configurations.set(owner, previous);
        throw error;
      }
    },
    // The session's next rounds run in the Host's worktree of its folder; the folder, and what the embedded Files and Git show, stay as they are.
    select: async (owner, parent, worktree) => {
      if (owner !== s.current || parent !== s.workspaceId) throw new Error(uiText.text("coding.error.worktree-changed"));
      const previous = s.worktree;
      s.worktree = { worktree_id: worktree.worktree_id, canonical_path: worktree.canonical_path };
      rememberConfiguration(page);
      try {
        await refs.draft.flush();
      } catch (error) {
        if (!lifetime.alive) return;
        s.worktree = previous;
        rememberConfiguration(page);
        throw error;
      }
      await refreshState(page);
      status(page, uiText.text("coding.worktrees.used-next"));
    },
    chosen: () => s.worktree?.worktree_id,
    // Opened for the session it was asked on; the dialog reads where the session ran from the Host.
    integrate: (owner, worktreeId) => { if (owner === s.current) void refs.integrations.openWorktree(owner, worktreeId); },
  });
}

/** Starts a round that carries out a revision of the session's plan. */
async function executePlan(page: Page, revision: number) {
  const { q, refs, s } = page;
  if (s.sending || s.recovery || s.checkpointBusy || !s.current) throw new Error(uiText.text("coding.error.busy"));
  const id = s.current, [provider_id, model_id] = JSON.parse(q<HTMLSelectElement>("[data-coding-model]").value) as [string, string];
  const intent = q<HTMLSelectElement>("[data-coding-intent]").value === "parallel" ? "parallel" : "execute";
  const request = {
    plan_revision: revision, intent, provider_id, model_id, ...refs.composerModels.effort(), workspace_id: s.workspaceId, ...(s.worktree ? { worktree_id: s.worktree.worktree_id } : {}),
    ...(intent === "parallel" ? { writer_assignments: structuredClone(s.configurations.get(id)?.writer_assignments || []) } : {}),
    methods: structuredClone(s.methodSelections.get(id) || []), materials: structuredClone(s.materialSelections.get(id) || []), character: structuredClone(s.characterSelections.get(id) ?? null),
    character_skill_ids: s.characterSkills.get(id), action_tools: structuredClone(s.actionSelections.get(id) || []), mcp_tools: structuredClone(s.mcpSelections.get(id) || []),
    mcp_sources: structuredClone(s.mcpSourceSelections.get(id) || []),
  };
  s.sending = true;
  controls(page);
  try {
    await refs.draft.flush();
    await api(page, sessionPath(id) + "/runs", "POST", request);
    await refreshState(page);
    if (id === s.current) await readCurrent(page);
  } finally {
    s.sending = false;
    controls(page);
  }
}

/** The plan and the review of a round's changes: each opens in the results panel, and the review's remarks go to the draft. */
function mountReview(page: Page) {
  const { readText, input, lifetime, q, refs, root, s } = page;
  refs.plans = plansClient({ ...s.ports, execute: revision => executePlan(page, revision) });
  refs.changeReview = changesetClient({
    lifetime, translate: readText, root, q, api: s.ports.api, current: () => s.current, closeReport: () => closeReport(page), returnToTask: () => returnFromChange(page),
    onRunOpen: () => { s.changeItem = ""; s.reportItem = ""; renderArtifacts(page); },
    appendDraft: task => refs.draft.append(s.current, text => {
      const next = text.endsWith(task) ? text : (text ? text + "\n\n" : "") + task;
      if (next.length > 100000) throw new Error(uiText.text("coding.feedback.too-long"));
      return next;
    }, uiText.text("coding.feedback.still-loading")),
    focusDraft: () => { returnFromChange(page); input.focus(); status(page, uiText.text("coding.feedback.added")); },
  });
}

/** What the round's choices are made with: the Host's actions as operation cards, and the Character. */
function mountChoices(page: Page) {
  const { readText, host, lifetime, q, refs, s } = page;
  s.materialTicket = 0;
  refs.renderCards = actionsClient({
    ...s.ports, selections: s.actionSelections, save: refs.draft.saveChoices, controls: () => controls(page), interaction: (node, options) => host.interaction(node, options),
    make: tag => document.createElement(tag), sessionPath, readCurrent: () => readCurrent(page),
  }).renderCards;
  characterChoice({
    ...s.ports, lifetime, translate: readText, q, selections: s.characterSelections, titles: s.characterTitles, skillSelections: s.characterSkills, save: refs.draft.saveChoices, controls: () => controls(page),
  });
}

/** Colours the code the conversation shows, and keeps the diffs in the page coloured as they grow. */
function mountCodePaint(page: Page) {
  const { lifetime, refs, root, s } = page, paint = createCodingCodePaint(codeTokens, growCodeTokens, codeLanguage);
  refs.pieceNode = paint.pieceNode;
  refs.paintInto = paint.paintInto;
  refs.paintBlock = paint.paintBlock;
  refs.growCode = paint.growCode;
  refs.paintRows = paint.paintRows;
  refs.codeSource = paint.source;
  s.paintFrame = 0;
  lifetime.observe(new MutationObserver(() => {
    if (s.paintFrame) return;
    s.paintFrame = lifetime.frame(() => { s.paintFrame = 0; paintDiffs(page, root); });
  }), root, { childList: true, subtree: true });
}

/** Makes the parts that act on the session's work: its directories, plan, review, choices and coloured code. */
export function mountWork(page: Page) {
  mountWriterDirectories(page);
  mountReview(page);
  mountChoices(page);
  mountCodePaint(page);
}

