import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { showLink } from "./link.js";
import { onModelReady, showFlow } from "./nav.js";
import type { WorkflowsPage } from "./page.js";
import { toast } from "./toast.js";
import type { UiReturnOutcome } from "@molis-ai/molis-work-plugin-sdk";

/**
 * The way to the model settings from a link that needs a text model, and back to it (specs/draft-and-return §4): the flow is the
 * trip's object and the link its step, so the platform brings the person back to this flow and the page opens that link again
 * and reads again whether it can hand over. Nothing runs on the way back: the person goes on from the link.
 */
export function goForModel(page: WorkflowsPage): void {
  const flow = page.ui.workflow, index = page.ui.openLink;
  if (!flow) return;
  const carry = { object: { kind: "workflow", id: flow.workflow_id }, ...(index === null ? {} : { step: "link:" + index }) };
  page.host.returns.go({ kind: "model" }, carry).then(outcome => back(page, outcome), (error: unknown) => toast(page, messageOf(error), "error"));
}

/** A trip this page opened that ended after the page was rebuilt (a reload, the tab reopened): its link opens again. */
export async function cameBack(page: WorkflowsPage): Promise<void> {
  try {
    const outcome = await page.host.returns.arrived();
    if (outcome) await back(page, outcome);
  } catch (error) { toast(page, messageOf(error), "error"); }
}

async function back(page: WorkflowsPage, outcome: UiReturnOutcome): Promise<void> {
  const id = outcome.carry.object?.kind === "workflow" ? outcome.carry.object.id : "";
  const step = /^link:(\d{1,4})$/u.exec(outcome.carry.step ?? "");
  if (!id) return;
  if (page.listReady) await page.listReady;
  if (page.ui.workflow?.workflow_id !== id || page.ui.instance) await showFlow(page, id);
  if (page.ui.workflow?.workflow_id !== id) return;
  await onModelReady(page);
  const index = step ? Number(step[1]) : -1;
  if (index >= 0 && index < page.ui.workflow.links.length) showLink(page, index);
}
