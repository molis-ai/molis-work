/**
 * What the page shows at one point of a scene: the thread so far, every input's line, the "还没处理的" tray, the end
 * card and the recovery banner. A pure function of a recording and a cursor — no clock, no I/O — so the same code
 * serves the browser and the tests, and every line on the page can be traced to a recorded fact (RCPT-R0-02).
 */
import { fourQuestions, evidenceFor, headline, type Evidence, type FourQuestions, type Headline, type Phase } from "./headline.ts";
import type { Checkpoint, Ledger, QueueView, QueuedItem, Receipt, RecordedRun, Scene } from "./facts.ts";

export interface Cursor { readonly run: number; readonly at: number }

export interface InputRow {
  readonly kind: "input";
  readonly n: number;
  readonly receipt: Receipt;
  readonly headline: Headline;
  readonly evidence: readonly Evidence[];
  readonly four: FourQuestions;
  /** The person's correction names this input (`about`): the later input's number. */
  readonly supersededBy: number | undefined;
  /** This input is itself a correction of another one. */
  readonly corrects: number | undefined;
  readonly run: number;
}
export type ThreadRow =
  | { readonly kind: "task"; readonly text: string; readonly run: number; readonly atMs?: number }
  | { readonly kind: "assistant"; readonly text: string }
  | { readonly kind: "ack-call"; readonly count: number }
  | { readonly kind: "question"; readonly why: string; readonly prompt: string; readonly options: readonly string[]; readonly answered: boolean }
  | { readonly kind: "host"; readonly text: string; readonly source: string; readonly atMs: number }
  | { readonly kind: "recovered"; readonly note: string }
  | { readonly kind: "divider"; readonly label: string }
  | { readonly kind: "end"; readonly run: number; readonly state: string; readonly code?: string }
  | InputRow;

export type TrayKey = "unread" | "unexplained" | "pending" | "undecided" | "clarify";
export interface TrayEntry { readonly n: number; readonly text: string; readonly why: string }
export interface Tray { readonly total: number; readonly groups: readonly { readonly key: TrayKey; readonly label: string; readonly entries: readonly TrayEntry[] }[] }

export interface View {
  readonly scene: Scene;
  readonly cursor: Cursor;
  readonly rows: readonly ThreadRow[];
  readonly tray: Tray;
  readonly queue: QueueView | undefined;
  readonly checkpoint: Checkpoint | undefined;
  readonly phase: Phase;
  /** Number of the input behind a steer id, stable over the whole scene. */
  readonly number: (steerId: string) => number;
}

const TRAY_LABEL: Readonly<Record<TrayKey, string>> = {
  unread: "没读到", unexplained: "读到没说明", pending: "说要做，还没完成", undecided: "没采纳，等你决定", clarify: "需要你澄清",
};

/** Numbers the inputs of a whole scene in the order a reader meets them, so "#3" means the same thing at every cursor. */
export function numbering(scene: Scene): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  const add = (id: string): void => { if (!out.has(id)) out.set(id, out.size + 1); };
  scene.runs.forEach((run, index) => {
    for (const event of run.events) if (event.type === "prompt" && typeof event["steerId"] === "string" && event["source"] !== "app" && event["source"] !== "peer") add(event["steerId"]);
    for (const cp of scene.checkpoints) if (cp.run === index) for (const item of cp.queue?.queued ?? []) add(item.inputId);
  });
  return out;
}

function projectionAt(run: RecordedRun, at: number): readonly Receipt[] {
  let found: readonly Receipt[] = [];
  for (const one of run.projections) if (one.at <= at) found = one.receipts;
  return found;
}

const isTerminal = (event: Ledger): boolean => event.type === "completed" || event.type === "failed" || event.type === "cancelled";

export function phaseOf(events: readonly Ledger[]): Phase {
  let awaiting = false;
  for (const event of events) {
    if (event.type === "awaiting-input") awaiting = true;
    else if (awaiting && event.type === "tool-result") awaiting = false;
  }
  return { awaiting, ended: events.some(isTerminal) };
}

export function checkpointAt(scene: Scene, id: string): Checkpoint {
  const found = scene.checkpoints.find(one => one.id === id);
  if (found === undefined) throw new Error(`scene ${scene.id} has no checkpoint ${id}`);
  return found;
}

const asText = (value: unknown): string => (typeof value === "string" ? value : "");
function callNumbers(events: readonly Ledger[]): (callId: string) => number | undefined {
  const calls = events.flatMap(event => (event.type === "usage-recorded" && typeof event["callId"] === "string" ? [event["callId"]] : []));
  return callId => { const at = calls.indexOf(callId); return at < 0 ? undefined : at + 1; };
}

/** The view of `scene` with its cursor at `cursor`. `checkpoint` (if the cursor rests on one) brings the SDK's queue report. */
export function viewAt(scene: Scene, cursor: Cursor, checkpoint?: Checkpoint): View {
  const numbers = numbering(scene);
  const number = (id: string): number => numbers.get(id) ?? 0;
  const rows: ThreadRow[] = [];
  const latest = new Map<string, InputRow>();
  let phase: Phase = { awaiting: false, ended: false };
  for (let index = 0; index <= cursor.run && index < scene.runs.length; index += 1) {
    const run = scene.runs[index];
    if (run === undefined) continue;
    const upTo = index === cursor.run ? cursor.at : run.events.length;
    const events = run.events.slice(0, upTo);
    const receipts = new Map(projectionAt(run, upTo).map(one => [one.steerId, one] as const));
    phase = phaseOf(events);
    if (index > 0) rows.push({ kind: "divider", label: run.label });
    const rowsOfRun = threadOf(run, events, index, receipts, phase, number);
    for (const row of rowsOfRun) { rows.push(row); if (row.kind === "input") latest.set(row.receipt.steerId, row); }
  }
  // A later input that names an earlier one (`about`) is the person's correction of it.
  const all = [...latest.values()];
  const fixed = all.map(row => {
    const by = all.find(other => other.receipt.about === row.receipt.steerId);
    return by === undefined ? row : { ...row, supersededBy: by.n, headline: headline(row.receipt, phase, { byNumber: by.n }) };
  });
  const patched = rows.map(row => (row.kind === "input" ? (fixed.find(one => one.receipt.steerId === row.receipt.steerId && one.run === row.run) ?? row) : row));
  const queue = checkpoint?.queue;
  return { scene, cursor, rows: patched, tray: trayOf(fixed, queue, number), queue, checkpoint, phase, number };
}

function threadOf(run: RecordedRun, events: readonly Ledger[], index: number, receipts: ReadonlyMap<string, Receipt>, phase: Phase, number: (id: string) => number): ThreadRow[] {
  const rows: ThreadRow[] = [];
  const label = (id: string): string => `#${String(number(id))}`;
  const calls = callNumbers(events);
  let text = "";
  const flush = (): void => { if (text.length > 0) rows.push({ kind: "assistant", text }); text = ""; };
  events.forEach((event, at) => {
    if (event.type === "text-delta") { text += asText(event["text"]); return; }
    if (event.type === "prompt") {
      flush();
      const steerId = asText(event["steerId"]);
      if (steerId === "") {
        if (event["role"] === "user") rows.push({ kind: "task", text: asText(event["text"]), run: index, atMs: Number(event["atMs"]) });
        return;
      }
      const receipt = receipts.get(steerId);
      if (receipt === undefined) return;
      if (receipt.source !== "person") { rows.push({ kind: "host", text: receipt.text, source: receipt.source, atMs: receipt.atMs }); return; }
      const corrected = receipt.about === undefined ? undefined : number(receipt.about);
      rows.push({
        kind: "input", n: number(steerId), receipt, run: index,
        headline: headline(receipt, phase),
        evidence: evidenceFor(receipt, events, calls),
        four: fourQuestions(receipt, phase, label),
        supersededBy: undefined, corrects: corrected === 0 ? undefined : corrected,
      });
      return;
    }
    if (event.type === "tool-call") {
      flush();
      const call = event["call"];
      const info = typeof call === "object" && call !== null && !Array.isArray(call) ? call : {};
      if (info["name"] === "acknowledge-inputs") {
        const args = info["input"];
        const items = typeof args === "object" && args !== null && !Array.isArray(args) ? args["items"] : undefined;
        rows.push({ kind: "ack-call", count: Array.isArray(items) ? items.length : 0 });
      } else if (info["name"] === "ask-user") {
        const args = info["input"];
        const questions = typeof args === "object" && args !== null && !Array.isArray(args) && Array.isArray(args["questions"]) ? args["questions"] : [];
        const first = questions[0];
        const asked = typeof first === "object" && first !== null && !Array.isArray(first) ? first : {};
        const options = Array.isArray(asked["options"]) ? asked["options"].map(one => (typeof one === "object" && one !== null && !Array.isArray(one) ? asText(one["label"]) : "")) : [];
        const answered = events.slice(at + 1).some(later => later.type === "tool-result");
        rows.push({ kind: "question", why: asText(typeof args === "object" && args !== null && !Array.isArray(args) ? args["why"] : ""), prompt: asText(asked["prompt"]), options, answered });
      }
      return;
    }
    if (event.type === "run-recovered") { flush(); rows.push({ kind: "recovered", note: "宿主重启后核对并收口：没有重放任何操作，也没有开新的一轮" }); return; }
    if (isTerminal(event)) {
      flush();
      const error = event["error"];
      const code = typeof error === "object" && error !== null && !Array.isArray(error) ? asText(error["code"]) : "";
      rows.push({ kind: "end", run: index, state: event.type, ...(code === "" ? {} : { code }) });
    }
  });
  flush();
  void run;
  return rows;
}

function trayOf(rows: readonly InputRow[], queue: QueueView | undefined, number: (id: string) => number): Tray {
  const groups: Record<TrayKey, TrayEntry[]> = { unread: [], unexplained: [], pending: [], undecided: [], clarify: [] };
  const seen = new Set<string>();
  const put = (key: TrayKey, entry: TrayEntry, id: string): void => { if (!seen.has(id)) { seen.add(id); groups[key].push(entry); } };
  for (const item of queue?.queued ?? []) {
    put("unread", { n: number(item.inputId), text: item.text, why: queueWhy(item) }, item.inputId);
  }
  for (const row of rows) {
    const { receipt } = row;
    const entry = (why: string): TrayEntry => ({ n: row.n, text: receipt.text, why });
    if (row.supersededBy !== undefined) continue;
    if (receipt.state === "accepted" || receipt.state === "applied") put("unread", entry("还没被 AI 读到"), receipt.steerId);
    else if (receipt.state === "unread" && queue === undefined) put("unread", entry("这一轮结束了，它没被读到"), receipt.steerId);
    else if (receipt.state === "read" && receipt.handling === undefined) put("unexplained", entry("AI 读到了，但没说明怎么处理"), receipt.steerId);
    else if (receipt.handling?.treatment === "later-step" || receipt.handling?.treatment === "new-task") put("pending", entry(receipt.handling.note ?? "AI 说要做，还没做完"), receipt.steerId);
    else if (receipt.handling?.treatment === "not-adopted") put("undecided", entry(receipt.handling.note ?? "AI 暂不采纳"), receipt.steerId);
    else if (receipt.handling?.treatment === "needs-clarification") put("clarify", entry(receipt.handling.note ?? "AI 需要你澄清"), receipt.steerId);
  }
  const keys: readonly TrayKey[] = ["unread", "unexplained", "pending", "undecided", "clarify"];
  const list = keys.map(key => ({ key, label: TRAY_LABEL[key], entries: groups[key] }));
  return { total: list.reduce((sum, one) => sum + one.entries.length, 0), groups: list };
}

function queueWhy(item: QueuedItem): string {
  if (item.from === undefined) return "你交给会话排着的，还没进过任何一轮";
  const interrupted = item.from.endedBy.code === "RUN_INTERRUPTED";
  return `${interrupted ? "重启时被中断" : "上一轮结束了"}，${item.from.applied ? "已放进上下文却没等到回复" : "一直排着没交给 AI"}`;
}
