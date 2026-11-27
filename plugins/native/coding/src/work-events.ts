import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertWorkEventWindow, defineWorkEventsAction, withinWorkEventWindow, type WorkEvent, type WorkEventCollection, type WorkEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindOwnerPluginAction, type ActionHandlerBinding } from "@molis-ai/molis-work-plugin-sdk";
import { CODING_RING, CODING_STANDING } from "./home-background.js";
import type { CodingSessionStore } from "./store.js";

/**
 * What Coding puts on the work line (specs/work-line §5): its sessions. One whose round is under way or waiting, or that still holds
 * open steps or running commands, sits beside now; one that ended in the window is behind it. The work under way is not said here:
 * it is the session's row in the table of background tasks (home-background.ts), which serves this same object, so the line shows
 * the event in progress or waiting from that row and back in its own state when the row is gone.
 */
const rawCodingWorkEventsAction = defineWorkEventsAction("coding.events", /* @version action.coding.events */ 1, ["coding_session"], "Coding 事件", ["artifact:read"]);
export const codingWorkEventsAction = { ...rawCodingWorkEventsAction, action: { ...rawCodingWorkEventsAction.action, title_text: { key: "coding.action.events.title" }, description_text: { key: "coding.action.events.description" } } };

/** The sessions that ended in the window, newest first, are many in a busy project; the line shows the latest of them. */
const MAX_ENDED = 20;

export function codingWorkEvents(sessions: CodingSessionStore, projectId: string, window: WorkEventWindow): WorkEvent[] {
  const held = new Set(sessions.backgroundSessions().map(session => session.session_id));
  const events: WorkEvent[] = [];
  let ended = 0;
  for (const session of sessions.list(projectId)) {
    const active = held.has(session.session_id);
    if (!active && (!withinWorkEventWindow(session.updated_at, window) || ++ended > MAX_ENDED)) continue;
    const label = uiText.text("coding.home-background.open-session"), standing = CODING_STANDING[session.state];
    events.push({ event_id: "coding-session:" + session.session_id, subject: { kind: "coding_session", id: session.session_id }, title: session.title || label,
      summary: standing ? uiText.text(standing) : uiText.text("coding.home-background.the-round-ended"), content: "", facts: [], category: "personal",
      placement: active ? "active" : "occurred", occurred_at: session.updated_at, state: CODING_RING[session.state] ?? "round-ended", needs_attention: false,
      open: { kind: "item", surface: "coding", id: session.session_id, title: session.title || label, label } });
  }
  return events;
}

export function codingWorkEventsHandler(context: PluginStartContext, sessions: CodingSessionStore): ActionHandlerBinding {
  return bindOwnerPluginAction(context, codingWorkEventsAction, (input): WorkEventCollection => {
    assertWorkEventWindow(input);
    return { source: { surface: "coding", title: "Coding", icon: "code" }, events: codingWorkEvents(sessions, context.project_id ?? "", input) };
  });
}
