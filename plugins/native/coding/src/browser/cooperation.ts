import { drawBackground, drawBanner, drawSection } from "./cooperation-draw.js";
import type { BackgroundTask, Coop, CooperationClient, CooperationPorts, Delegations, Mail } from "./cooperation-types.js";
import { el, errorMessage } from "./dom.js";

export type { CooperationClient, CooperationPorts } from "./cooperation-types.js";

/** What the delegation dialog holds: the project knowledge picked to go with the task. */
interface Dialog {
  readonly node: HTMLDialogElement;
  picks: { kind: string; id: string; title: string }[];
  ticket: number;
}

/** The last read: for whom, when, and what was drawn from it. */
interface Reading { owner: string; readAt: number; reading: boolean; drawnKey: string }

const REREAD_MS = 3000;

/** Reads the session's delegations, messages and background commands, and draws them when they changed. */
async function refresh(coop: Coop, reading: Reading, force = false) {
  const { ports } = coop, { api, current, lifetime } = ports, id = current();
  if (!id || reading.reading) return;
  if (!force && reading.owner === id && Date.now() - reading.readAt < REREAD_MS) return;
  reading.reading = true;
  try {
    const base = "/sessions/" + encodeURIComponent(id);
    const [value, messages, background] = await Promise.all([
      api<Delegations>(base + "/delegations"),
      api<{ messages: Mail[] }>(base + "/messages").catch(() => ({ messages: [] as Mail[] })),
      api<{ commands: BackgroundTask[] | null }>(base + "/background").catch(() => ({ commands: null })),
    ]);
    if (id !== current()) return;
    coop.backgroundUnknown = background.commands === null;
    coop.commands = background.commands ?? (reading.owner === id ? coop.commands : []);
    reading.owner = id;
    reading.readAt = Date.now();
    coop.mail = messages.messages;
    const key = JSON.stringify([id, value, coop.mail, coop.commands, coop.backgroundUnknown, ports.rounds().map(round => [round.run_id, round.phase, round.number])]);
    if (force || key !== reading.drawnKey) {
      reading.drawnKey = key;
      drawBanner(coop, value.incoming);
      drawSection(coop, value);
      drawBackground(coop);
    }
  } catch {
    if (!lifetime.alive) return;
    if (id === current()) coop.banner.hidden = true;
  } finally {
    reading.reading = false;
  }
}

const field = <Found extends HTMLElement>(dialog: Dialog, selector: string) => {
  const found = dialog.node.querySelector<Found>(selector);
  if (!found) throw new Error("delegation dialog: " + selector);
  return found;
};

function drawPicks(coop: Coop, dialog: Dialog) {
  const L = coop.ports.translate;
  field(dialog, "[data-coding-delegate-outputs]").replaceChildren(...(dialog.picks.length ? dialog.picks.map(pick => el("p", pick.title, "coding-coop-line")) : [el("p", L("coding.coop.no-materials"), "coding-coop-note")]));
}

/** Opens the dialog that hands a task to a new session, with the composer's text as the start. */
function openDialog(coop: Coop, dialog: Dialog) {
  const { q, current } = coop.ports;
  if (!current()) return;
  field<HTMLFormElement>(dialog, "form").reset();
  field(dialog, "[data-coding-delegate-status]").textContent = "";
  field<HTMLTextAreaElement>(dialog, "[data-coding-delegate-task]").value = q<HTMLTextAreaElement>("[data-coding-task]").value.trim();
  dialog.picks = [];
  dialog.ticket++;
  drawPicks(coop, dialog);
  field(dialog, "[data-coding-delegate-pick]").hidden = document.documentElement.dataset.knowledgePicker !== "1";
  dialog.node.showModal();
  field(dialog, "[data-coding-delegate-title]").focus();
}

/** Creates the session the task is handed to. */
async function createDelegation(coop: Coop, dialog: Dialog, reading: Reading, event: Event) {
  const { ports } = coop, { translate: L, api, current, status, lifetime } = ports;
  event.preventDefault();
  const id = current(), message = field(dialog, "[data-coding-delegate-status]"), send = field<HTMLButtonElement>(dialog, "[data-coding-delegate-create]");
  const task = field<HTMLTextAreaElement>(dialog, "[data-coding-delegate-task]").value.trim(), title = field<HTMLInputElement>(dialog, "[data-coding-delegate-title]").value.trim();
  if (!task) {
    message.textContent = L("coding.coop.write-task");
    return;
  }
  const materials = dialog.picks;
  send.disabled = true;
  message.textContent = L("coding.coop.creating");
  try {
    const result = await api<{ delivery_unconfirmed?: boolean; session: { title: string } }>("/sessions/" + encodeURIComponent(id) + "/delegations", "POST", { task, ...(title ? { title } : {}), materials });
    dialog.node.close();
    await ports.refreshSessions();
    status(result.delivery_unconfirmed ? L("coding.coop.unconfirmed") : L("coding.coop.created", { title: result.session.title }), Boolean(result.delivery_unconfirmed));
    await refresh(coop, reading, true);
  } catch (error) {
    if (!lifetime.alive) return;
    message.textContent = errorMessage(error);
  } finally {
    send.disabled = false;
  }
}

/** The cooperation panels of a session: the delegation it received, the ones it made, its messages and its background commands. */
export function cooperationClient(ports: CooperationPorts): CooperationClient {
  const { lifetime, q } = ports;
  const reading: Reading = { owner: "", readAt: 0, reading: false, drawnKey: "" };
  const coop: Coop = {
    ports, banner: q("[data-coding-delegation-banner]"), section: q("[data-coding-cooperation]"), backgroundSection: q("[data-coding-background]"),
    mail: [], commands: [], backgroundUnknown: false, again: () => refresh(coop, reading, true),
  };
  // What goes with the task is picked from project knowledge in the page's one picker (specs/project-knowledge PMAT-18), as the
  // next round's materials are; the other session reads each piece through knowledge.read when its round starts.
  const dialog: Dialog = { node: q<HTMLDialogElement>("[data-coding-delegate-dialog]"), picks: [], ticket: 0 };
  lifetime.listen(field(dialog, "[data-coding-delegate-pick]"), "click", () => {
    document.dispatchEvent(new CustomEvent("molis-work:knowledge-pick", { detail: { request_id: "coding-delegate:" + (++dialog.ticket), selected: structuredClone(dialog.picks), max: 30 } }));
  });
  lifetime.listen(document, "molis-work:knowledge-picked", event => {
    const detail: { request_id?: unknown; picks?: { kind: string; id: string; title: string }[] } | null = event instanceof CustomEvent ? event.detail : null;
    if (String(detail?.request_id || "") !== "coding-delegate:" + dialog.ticket || !dialog.node.open) return;
    dialog.picks = (detail?.picks || []).map(pick => ({ kind: pick.kind, id: pick.id, title: pick.title }));
    drawPicks(coop, dialog);
  });
  lifetime.listen(field(dialog, "form"), "submit", event => createDelegation(coop, dialog, reading, event));
  lifetime.listen(field(dialog, "[data-coding-delegate-cancel]"), "click", () => dialog.node.close());
  return {
    refresh: force => refresh(coop, reading, force),
    openDialog: async () => openDialog(coop, dialog),
    reset() {
      reading.owner = "";
      coop.mail = [];
      coop.commands = [];
      coop.backgroundUnknown = false;
      for (const part of [coop.backgroundSection, coop.banner, coop.section]) {
        part.hidden = true;
        part.replaceChildren();
      }
    },
  };
}
