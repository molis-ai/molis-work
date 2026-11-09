import type { UiAppearanceApplyInput, UiAppearanceChoice, UiAppearanceReceipt, UiAppearanceRecovery, UiAppearanceUndoInput, UiRequestCall, UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkbenchAppearance } from "../appearance-document.js";
import { readEventStream } from "./event-stream.js";

const path = "/api/ui/appearance";
const handoffKey = "molis-work:appearance-handoff";
interface ReadReply { current: WorkbenchAppearance; recovery?: UiAppearanceRecovery; recovery_revision?: number | null }
interface WriteReply { current: WorkbenchAppearance; receipt: UiAppearanceReceipt }
type CommandInput = { kind: "apply"; body: UiAppearanceApplyInput } | { kind: "undo"; body: UiAppearanceUndoInput };
type Command = CommandInput & { checked: boolean };
interface SyncView {
  present(current: WorkbenchAppearance): void;
  failed(error: unknown): void;
  confirmed(receipt: UiAppearanceReceipt, kind: Command["kind"]): void;
  absent(): void;
  changed(): void;
}

const code = (error: unknown) => (error as Partial<UiRequestFailure> | null)?.code;
const auth = (status: unknown) => status === 401 || status === 403;
const revision = (view: WorkbenchAppearance) => view.selection_revision ?? -1;
const commandId = (command: CommandInput) => command.kind === "apply" ? command.body.request_id : command.body.applied_request_id;

function documentAppearanceHandoff() {
  // The second segment of the page proof is the public view scope. The proof itself never enters the handoff.
  const scope = window === top ? document.querySelector<HTMLMetaElement>('meta[name="molis-work-page-session"]')?.content.split(".")[1] : undefined;
  return {
    take(): Command | undefined {
      if (!scope) return;
      try {
        const raw = sessionStorage.getItem(handoffKey);
        sessionStorage.removeItem(handoffKey);
        if (!raw) return;
        const handoff = JSON.parse(raw) as { scope: string; command: CommandInput } | null;
        if (!handoff || handoff.scope !== scope) return;
        const { command } = handoff;
        if (command?.kind !== "apply" && command?.kind !== "undo") return;
        if (!Number.isSafeInteger(command.body?.expected_revision) || command.body.expected_revision < 0
          || !/^[0-9a-f-]{36}$/u.test(commandId(command))) return;
        return { ...command, checked: false };
      } catch { return undefined; }
    },
    save(command: Command | undefined): void {
      if (!scope || !command) return;
      const { kind, body } = command;
      try { sessionStorage.setItem(handoffKey, JSON.stringify({ scope, command: { kind, body } })); }
      catch { /* If storage is unavailable the original page retains its command in memory. */ }
    },
  };
}

interface InvalidationListener {
  active(): boolean;
  synchronize(force?: boolean): void;
  disconnected(): void;
  revision(revision: number): void;
  denied(status: number, signal: AbortSignal): void;
}

/** Keep the existing document authority and backoff on a single stream. The caller owns authoritative reads. */
function appearanceInvalidations(request: UiRequestCall, listener: InvalidationListener) {
  let stream: AbortController | undefined, retry: ReturnType<typeof setTimeout> | undefined, delay = 1000;

  async function connect(): Promise<void> {
    if (stream || !listener.active()) return;
    const connection = new AbortController();
    stream = connection;
    try {
      const reply = await request<Response>(`${path}/events`, { method: "GET", control: true, as: "response",
        signal: connection.signal, headers: { accept: "text/event-stream" } });
      if (auth(reply.status)) { listener.denied(reply.status, connection.signal); return; }
      if (reply.status !== 200 || !reply.headers.get("content-type")?.startsWith("text/event-stream") || !reply.body) return;
      listener.synchronize();
      await readEventStream(reply.body, {
        message(data) {
          const { selection_revision: seen } = JSON.parse(data) as { selection_revision: number };
          if (!Number.isSafeInteger(seen) || seen < 0) return;
          delay = 1000;
          listener.revision(seen);
        },
      });
    } catch { /* The next authorized connection rereads the Home. */ }
    finally {
      if (stream === connection) stream = undefined;
      if (!connection.signal.aborted && listener.active()) {
        listener.disconnected();
        retry = setTimeout(() => { void connect(); }, delay);
        delay = Math.min(15_000, delay * 2);
      }
    }
  }

  function stop() {
    clearTimeout(retry);
    stream?.abort();
    stream = undefined;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stop(); listener.disconnected(); }
    else { listener.synchronize(true); void connect(); }
  });
  return { connect, stop };
}

/** One document, one original page proof and one invalidation stream. The server remains the only selection owner. */
export function createAppearanceSync(initial: WorkbenchAppearance, request: UiRequestCall, view: SyncView) {
  let current = initial, invalidated = revision(initial);
  let lifetime = new AbortController(), refused = false;
  let reading = false, writing = false, forceRead = false, scheduled: ReturnType<typeof setTimeout> | undefined;
  const handoff = documentAppearanceHandoff();
  let unconfirmed = handoff.take();

  function accept(next: WorkbenchAppearance): void {
    if (next.selection_revision !== null && revision(next) < revision(current)) return;
    current = next;
    view.present(next);
  }

  async function read(command?: Command): Promise<ReadReply> {
    const signal = lifetime.signal, before = current;
    const reply = await request<ReadReply>(command ? `${path}?request_id=${encodeURIComponent(commandId(command))}` : path, { control: true, signal });
    signal.throwIfAborted();
    if (reply.current.selection_revision !== null || before === current) accept(reply.current);
    return reply;
  }

  function readFailed(error: unknown, signal: AbortSignal): void {
    if (signal.aborted) return;
    if (auth((error as Partial<UiRequestFailure> | null)?.status)) {
      refused = true;
      stream.stop();
    }
    view.failed(error);
  }

  function queueRead(force = false): void {
    forceRead ||= force;
    if (scheduled !== undefined || reading || writing || refused || lifetime.signal.aborted || document.hidden
      || (!forceRead && invalidated <= revision(current))) return;
    scheduled = setTimeout(() => {
      scheduled = undefined;
      if (writing || reading || lifetime.signal.aborted || document.hidden) return;
      forceRead = false;
      reading = true;
      const before = invalidated, signal = lifetime.signal;
      void (unconfirmed ? verify(unconfirmed) : read()).then(() => {
        reading = false;
        view.changed();
        if (forceRead || invalidated > before) queueRead();
      }, error => { reading = false; readFailed(error, signal); if (signal !== lifetime.signal) queueRead(); });
    }, 0);
  }

  const stream = appearanceInvalidations(request, {
    active: () => !refused && !lifetime.signal.aborted && !document.hidden,
    synchronize: queueRead,
    disconnected() { forceRead = true; },
    revision(seen) {
      invalidated = Math.max(invalidated, seen);
      queueRead();
    },
    denied(status, signal) { readFailed({ status }, signal); },
  });
  window.addEventListener("pagehide", () => {
    stream.stop();
    if (!lifetime.signal.aborted) handoff.save(unconfirmed);
    lifetime.abort();
  });
  window.addEventListener("pageshow", event => {
    // Account isolation can discard a cached document. The replacement can verify only a handoff for its own scope.
    if (!event.persisted || globalThis.molisWorkAccountTransition?.preparing) return;
    lifetime = new AbortController();
    unconfirmed = handoff.take() ?? unconfirmed;
    if (unconfirmed) unconfirmed.checked = false;
    queueRead(true);
    void stream.connect();
  });
  if (unconfirmed) queueRead(true);
  void stream.connect();

  async function verify(command: Command): Promise<UiAppearanceReceipt | null> {
    const { current: latest, recovery, recovery_revision: checked } = await read(command);
    const receipt = command.kind === "apply" ? recovery?.applied : recovery?.undone;
    if (receipt) {
      unconfirmed = undefined;
      view.confirmed(receipt, command.kind);
    } else if (typeof checked === "number" && checked > command.body.expected_revision) {
      unconfirmed = undefined;
      view.absent();
    } else {
      // A read at the original revision can pass a write that has not entered the owner yet.
      command.checked = checked === command.body.expected_revision;
      // A newer projection and the receipt can come from different reads. Check again at the new revision.
      if (typeof checked === "number" && revision(latest) > checked) forceRead = true;
    }
    return receipt ?? null;
  }

  async function write(command: Command): Promise<UiAppearanceReceipt | null> {
    const signal = lifetime.signal;
    if (writing || refused || signal.aborted || (unconfirmed && unconfirmed !== command)) return null;
    const resending = unconfirmed === command;
    unconfirmed = command;
    command.checked = false;
    writing = true;
    view.changed();
    try {
      // The action owns idempotency across attempts. Each HTTP attempt needs its own one-time key.
      const reply = await request<WriteReply>(command.kind === "undo" ? `${path}/undo` : path, { body: command.body, signal });
      signal.throwIfAborted();
      unconfirmed = undefined;
      accept(reply.current);
      view.confirmed(reply.receipt, command.kind);
      return reply.receipt;
    } catch (error) {
      if (signal.aborted || (error as { name?: string } | null)?.name === "AbortError") return null;
      if (resending && auth((error as Partial<UiRequestFailure> | null)?.status)) {
        readFailed(error, signal);
        return null;
      }
      if (resending || ["actions.outcome_unknown", "actions.output_invalid_after_effect", "ui_host.outcome_unknown", "ui_host.invalid_response"].includes(code(error) ?? "")) {
        return await verify(command).catch(error => { readFailed(error, signal); return null; });
      }
      unconfirmed = undefined;
      if (code(error) === "appearance.revision_changed") { forceRead = true; throw error; }
      readFailed(error, signal);
      throw error;
    } finally {
      writing = false;
      view.changed();
      queueRead();
    }
  }

  return {
    get available() { return !refused; },
    get uncertain() { return unconfirmed !== undefined; },
    get submitting() { return writing; },
    get canContinue() { return !refused && !reading && !writing && unconfirmed?.checked === true && revision(current) === unconfirmed.body.expected_revision; },
    apply(choice: UiAppearanceChoice, expected_revision: number) {
      if (unconfirmed) return Promise.resolve(null);
      return write({ kind: "apply", body: { choice, expected_revision, request_id: crypto.randomUUID() }, checked: false });
    },
    undo(receipt: UiAppearanceReceipt) {
      if (unconfirmed) return Promise.resolve(null);
      return write({ kind: "undo", body: { applied_request_id: receipt.request_id,
        expected_revision: receipt.selection_revision }, checked: false });
    },
    retry() { queueRead(true); },
    continue() {
      if (!this.canContinue || !unconfirmed) return Promise.resolve(null);
      return write(unconfirmed);
    },
  };
}
