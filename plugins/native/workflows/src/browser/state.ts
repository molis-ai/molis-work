import type { WorkflowLink, WorkflowVerdict } from "../model.js";
import { ruleKey } from "./chain.js";
import { messageOf, said } from "./dom.js";
import type { WorkflowsPage } from "./page.js";
import { toast } from "./toast.js";
import type { JudgmentChoice, Ready, Station, StationInfo } from "./types.js";

export const stateKey = (page: WorkflowsPage) => "molis-workflows:" + page.host.route("/");

/** A plugin as the chain editor knows it; `action` is the step that runs one action. */
export const stnMeta = (page: WorkflowsPage, plugin: string): StationInfo => plugin === "action"
  ? { plugin, label: "workflows.station.action", icon: "zap", supported: true }
  : page.ui.stations.find((info) => info.plugin === plugin) || { plugin, label: plugin, icon: "grid", supported: false };

export const label = (page: WorkflowsPage, value: Station | string) => typeof value === "string"
  ? said(page.L, stnMeta(page, value).label)
  : value.action ? value.action.title : said(page.L, stnMeta(page, value.plugin).label);

/** Whether a link can carry content now, and if not, why: one of our message keys, or the words the Host gave for an absent station. */
export function readyState(page: WorkflowsPage, link: WorkflowLink): Ready {
  const { ui } = page;
  const chain = [ui.instance?.chain, ui.workflow].find((candidate) => candidate?.links.includes(link));
  const index = chain ? chain.links.indexOf(link) : -1;
  if (chain && index >= 0) {
    const absent = chain.stations.slice(index, index + 2).find((station) => station.availability?.available === false);
    if (absent) return { ready: false, reason: absent.availability?.reason ?? "" };
  }
  if (link.kind === "manual") return { ready: true, reason: "" };
  if (link.kind === "judgment") {
    if (!link.judgment) return { ready: false, reason: "workflows.ready.no-judgment" };
    const known = (ui.judgments || []).find((row) => ruleKey(row.ref) === ruleKey(link.judgment));
    if (ui.judgments && !known) return { ready: false, reason: "workflows.ready.rule-gone" };
    if (known && !known.available) return { ready: false, reason: known.reason || "workflows.ready.rule-unavailable" };
    return (link.pass || []).length ? { ready: true, reason: "" } : { ready: false, reason: "workflows.ready.no-pass" };
  }
  if (link.kind === "function") return link.body_template.trim() ? { ready: true, reason: "" } : { ready: false, reason: "workflows.ready.no-template" };
  if (!link.instructions.trim()) return { ready: false, reason: "workflows.ready.no-instructions" };
  if (!ui.ai) return { ready: false, reason: "workflows.ready.no-model" };
  return { ready: true, reason: "" };
}

export function ruleText(page: WorkflowsPage, verdict: WorkflowVerdict) {
  const { L } = page;
  return verdict.status === "needs_review" ? L("workflows.verdict.needs-review") : L("workflows.verdict.result", { choice: verdict.choice || L("workflows.verdict.none") })
    + (verdict.confidence == null ? "" : " · " + L("workflows.verdict.confidence", { value: Math.round(verdict.confidence * 100) }));
}

/** The Choice rules a link can use, read once and again on demand. */
export async function loadRules(page: WorkflowsPage, force?: boolean): Promise<JudgmentChoice[]> {
  const { ui } = page;
  if (ui.judgments && !force) return ui.judgments;
  try { ui.judgments = (await page.api<{ judgments: JudgmentChoice[] }>("/judgments")).judgments; } catch (error) { ui.judgments = []; toast(page, messageOf(error), "error"); }
  return ui.judgments;
}
