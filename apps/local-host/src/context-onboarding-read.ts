import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { sessionsActions, sessionsErrors } from "@molis-ai/molis-work-contracts/services/sessions";
import type { ContextOnboardingPorts } from "./context-onboarding-service.js";
import type { ContextJourney, ContextSource, ImportFile } from "./context-onboarding-store.js";
import { prepareContextDocument } from "./context-onboarding-documents.js";
import { readOnboardingSessions, sessionKeyOf, sessionReadRefusal } from "./context-onboarding-sessions.js";
import { readContextSource } from "./context-onboarding-sources.js";
import { diskFull, hasStagedText, stagedFileSize } from "./context-onboarding-staging.js";

export type SessionReadGuard = { revision: string; check: () => Promise<void> };

/** Stage permitted originals for the person and give the organizer a fence for any sessions it will actually use. */
export async function readContextMaterials(home: string, journey: ContextJourney, sessionSource: ContextSource | undefined, signal: AbortSignal,
  ports: Pick<ContextOnboardingPorts, "sessions" | "readSource">, save: () => void, assertCurrent: () => void): Promise<SessionReadGuard | undefined> {
  let boundSessions: Promise<BoundActionClient> | undefined;
  const sessionClient = async () => {
    if (!ports.sessions) throw new Error("这里读不了外部会话");
    return boundSessions ??= ports.sessions(home, journey.project_id, signal);
  };
  let readScope: string | undefined;
  const readSessionsSource = async () => {
    const client = await sessionClient();
    readScope = (await client.invoke(sessionsActions.historyAuthorize, { session_keys: [] })).scope_revision;
    const read = await readOnboardingSessions(client, signal);
    if ("refused" in read) throw new Error(read.refused);
    return read;
  };
  // Bytes, not files, say how far reading has come (2026-10-22): one large file can be most of the wait. Staged files are counted
  // from the disk before reading starts, what the Host reads itself (mail, pasted text) as it is read; every pass counts again,
  // so a restart never counts a file twice.
  const stagedSize = (file: ImportFile) => file.staged ? stagedFileSize(home, journey.id, file.staged) : Promise.resolve(0);
  const bytes = journey.reading_bytes = { done: 0, total: 0 };
  for (const source of journey.sources.filter(s => s.selected)) {
    if (source.references) { const read = source.references.reduce((sum, ref) => sum + ref.original.size_bytes, 0); bytes.done += read; bytes.total += read; }
    else for (const file of source.files ?? []) bytes.total += await stagedSize(file);
  }
  save();
  // Reading is a queue: one file at a time, each saved as it is read, so a restart resumes after the last one (no limits, 2026-10-22).
  for (const source of journey.sources.filter(s => s.selected)) {
    signal.throwIfAborted();
    if (source.references) continue;
    // A new project has no sessions filed to it and no permit yet: the person chose them for the step after the project is made.
    if (source.kind === "sessions" && !journey.existing) continue;
    source.error = undefined; save();
    try {
      const sessions = source === sessionSource ? await readSessionsSource() : null;
      source.error = sessions?.notice;
      const titles: Record<string, string> = sessions?.titles ?? {};
      const input = sessions ?? await (ports.readSource ?? readContextSource)(home, source, signal);
      signal.throwIfAborted();
      const reusedByPath = new Map((source.reused_references ?? []).map(r => [r.path, r]));
      const reading = source.reading?.total === input.files.length
        ? source.reading
        : { done: 0, total: input.files.length, references: [], issues: [], held_secrets: [] };
      const counted = Boolean(source.files?.length);
      const sizeOf = async (file: ImportFile) => { if (counted) return stagedSize(file); const size = file.bytes?.length ?? 0; bytes.total += size; return size; };
      for (const file of input.files.slice(0, reading.done)) bytes.done += await sizeOf(file);
      source.reading = reading; save();
      // The checkpoint is written every 100 files or every second, whichever comes first: the row holds every reference so far, so a
      // write per file would cost the square of the file count. A restart reads those few files again, which staging makes cheap.
      let saved = Date.now();
      for (const file of input.files.slice(reading.done)) {
        signal.throwIfAborted();
        const prevRef = !file.bytes && !file.reason ? reusedByPath.get(file.path) : undefined;
        const canReuse = prevRef
          && (!file.staged || prevRef.original.sha256 === file.staged)
          && await hasStagedText(home, journey.id, prevRef.text);
        if (canReuse && prevRef) {
          reading.references.push(prevRef);
        } else {
          const read = await prepareContextDocument(home, journey.id, source.kind, file, signal, journey.secret_decisions);
          const session = source.kind === "sessions" ? sessionKeyOf(file.path) : null;
          if ("reference" in read && session) Object.assign(read.reference, { session_key: session, title: titles[file.path] ?? read.reference.title });
          if ("reference" in read) reading.references.push(read.reference);
          else if ("secret_hold" in read) (reading.held_secrets ??= []).push(read.secret_hold);
          else if ("issue" in read) reading.issues.push(read.issue);
        }
        bytes.done += await sizeOf(file); reading.done++;
        if (reading.done % 100 === 0 || Date.now() - saved >= 1000) { save(); saved = Date.now(); }
      }
      source.references = source === sessionSource && source.error && !reading.references.length ? undefined : reading.references;
      source.issues = reading.issues;
      source.skipped = reading.issues.length;
      source.held_secrets = reading.held_secrets?.length ? reading.held_secrets : undefined;
      source.reused_references = undefined;
      source.reading = undefined;
      source.files = undefined;
      source.text = undefined;
    } catch (error) {
      if (signal.aborted) throw error;
      assertCurrent();
      // The disk is full: the whole round stops at this file, and 继续整理 goes on from it.
      if (diskFull(error)) throw new Error("磁盘空间不足，已读取的材料仍在。腾出空间后点「继续整理」，会从这份文件接着读。");
      source.error = sessionReadRefusal(error) ?? (error instanceof Error ? error.message : "读取失败，请重试");
    }
    save();
  }
  bytes.done = bytes.total;
  let sessionGuard: SessionReadGuard | undefined;
  if (sessionSource?.references?.length && (!readScope || !sessionSource.error)) {
    try {
      const client = await sessionClient();
      const input = { session_keys: [...new Set(sessionSource.references.flatMap(ref => ref.session_key ? [ref.session_key] : []))] };
      if (!input.session_keys.length) throw sessionsErrors.scope_changed("已读材料缺少会话来源");
      const authorization = await client.invoke(sessionsActions.historyAuthorize, input);
      if (readScope && authorization.scope_revision !== readScope) throw sessionsErrors.scope_changed("外部会话读取许可已变化");
      sessionGuard = { revision: authorization.revision, check: async () => {
        assertCurrent();
        const current = await client.invoke(sessionsActions.historyAuthorize, input);
        signal.throwIfAborted();
        assertCurrent();
        if (current.revision !== authorization.revision) throw sessionsErrors.scope_changed("外部会话读取许可已变化");
      } };
      sessionSource.error = undefined;
    } catch (error) {
      signal.throwIfAborted();
      assertCurrent();
      sessionSource.error = sessionReadRefusal(error) ?? (error instanceof Error ? error.message : "读不了外部会话");
    }
  }
  return sessionGuard;
}
