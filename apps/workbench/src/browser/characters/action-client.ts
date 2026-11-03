import { messageOf, type ActionRef, type CharacterRequest, type FindPart } from "./common.js";

/** A row of the common Agent action catalog (`GET /actions`): only what this view reads. */
interface ActionRow {
  capability_id: string;
  version: number;
  action: { title: string; description: string; audiences: string[] };
  provider: { provider_id: string; title: string };
  availability: { available: boolean; reason: string };
}

interface Choice { ref: ActionRef; title: string; source: string; available: boolean; description: string }

export interface ActionHost { q: FindPart; request: CharacterRequest; changed: () => void }

/** The view of the action choice: what the Character form shows and keeps. `null` inherits the task's choice. */
export interface ActionClient {
  controls(busy: boolean): void;
  refresh(): Promise<void>;
  value(): ActionRef[] | null;
  render(value: ActionRef[] | null | undefined): void;
  describe(value: ActionRef[] | null | undefined): string;
}

const INHERIT_TEXT = "沿用任务选择";
const NONE_TEXT = "不使用动作能力";

const key = (ref: ActionRef): string => JSON.stringify([ref.capability_id, ref.version, ref.provider_id]);
const exact = (view: ActionRow): ActionRef => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

/** Markup from an older Characters release has no action fields: the rest of the page keeps working, and a draft saved from it keeps the action choice it already had rather than clearing it. */
function keepingView(): ActionClient {
  let kept: ActionRef[] | null = null;
  return {
    controls() {},
    async refresh() {},
    value: () => structuredClone(kept),
    render: value => { kept = value == null ? null : structuredClone(value); },
    describe: value => value == null ? INHERIT_TEXT : value.length ? value.map(ref => ref.capability_id + " · v" + ref.version).join("、") : NONE_TEXT,
  };
}

/** What the catalog offers to an Agent, then the selected references the catalog no longer offers (kept, shown unavailable). */
function choicesOf(rows: ActionRow[], refs: ActionRef[]): Choice[] {
  const found: Choice[] = rows.filter(row => row.action.audiences.includes("agent")).map(row => ({ ref: exact(row), title: row.action.title, source: row.provider.title,
    available: row.availability.available, description: row.availability.available ? row.action.description : row.availability.reason }));
  for (const ref of refs) {
    if (!found.some(row => key(row.ref) === key(ref))) found.push({ ref, title: ref.capability_id, source: ref.provider_id, available: false, description: "原能力、版本或授权不可用；引用保留，可明确移除。" });
  }
  return found;
}

function describeRefs(rows: ActionRow[], value: ActionRef[] | null | undefined): string {
  if (value == null) return INHERIT_TEXT;
  if (!value.length) return NONE_TEXT;
  return value.map(ref => {
    const row = rows.find(item => key(exact(item)) === key(ref));
    return (row?.action.title || ref.capability_id) + " · v" + ref.version + " · " + (row?.provider.title || ref.provider_id);
  }).join("、");
}

/** A view of the common Agent catalog; selected references remain in the original Character draft. */
export function characterActionClient(host: ActionHost): ActionClient {
  const { q, request, changed } = host;
  if (!q("actions-inherit") || !q("actions-list")) return keepingView();
  const part = <T extends HTMLElement = HTMLElement>(name: string): T => {
    const node = q<T>(name);
    if (!node) throw new Error("Characters page part missing: data-character-" + name);
    return node;
  };
  let rows: ActionRow[] = [], refs: ActionRef[] = [], busy = false, reading = false;

  const controls = (value: boolean): void => {
    busy = value;
    part<HTMLInputElement>("actions-inherit").disabled = busy;
    part<HTMLButtonElement>("actions-refresh").disabled = busy || reading;
    part("actions-list").querySelectorAll("input").forEach(input => { input.disabled = busy || (input.dataset.available !== "true" && !input.checked); });
  };
  const choiceRow = (row: Choice): HTMLLabelElement => {
    const label = document.createElement("label"), input = document.createElement("input"), copy = document.createElement("span");
    label.className = "characters-check"; input.type = "checkbox"; input.className = "mw-check";
    input.checked = refs.some(ref => key(ref) === key(row.ref)); input.dataset.available = String(row.available);
    copy.textContent = row.title + " · " + row.source + " · v" + row.ref.version + " — " + row.description;
    input.onchange = () => { refs = refs.filter(ref => key(ref) !== key(row.ref)); if (input.checked) refs.push(row.ref); changed(); };
    label.append(input, copy);
    return label;
  };
  const list = (): void => {
    const container = part("actions-list");
    container.replaceChildren(); part("actions-field").hidden = part<HTMLInputElement>("actions-inherit").checked;
    const shown = choicesOf(rows, refs);
    for (const row of shown) container.append(choiceRow(row));
    if (!shown.length) container.textContent = "还没有可用能力。请先在能力服务中为内置 Agent 授权，再刷新目录。";
    controls(busy);
  };
  const refresh = async (): Promise<void> => {
    if (reading) return;
    reading = true; controls(busy); part("actions-status").textContent = "正在读取当前项目的能力…";
    try {
      const data = await request<{ actions: ActionRow[] }>("GET", "/actions");
      rows = data.actions; list(); part("actions-status").textContent = "目录已更新；选中能力不会自动授权或执行。";
    } catch (error) {
      part("actions-status").textContent = messageOf(error) + "；已有选择保持。";
    } finally {
      reading = false; controls(busy);
    }
  };
  part<HTMLInputElement>("actions-inherit").onchange = () => { list(); changed(); };
  part<HTMLButtonElement>("actions-refresh").onclick = () => void refresh();
  return {
    controls, refresh,
    value: () => part<HTMLInputElement>("actions-inherit").checked ? null : structuredClone(refs),
    render: value => { refs = structuredClone(value || []); part<HTMLInputElement>("actions-inherit").checked = value == null; list(); },
    describe: value => describeRefs(rows, value),
  };
}
