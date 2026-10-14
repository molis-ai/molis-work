import { createHash } from "node:crypto";
import type { Runtime } from "@prologue/sdk";
import { createPluginBuilderAgent, type PluginBuilderAgentOptions } from "./plugin-builder.js";
import type { PrologueCredentialBridge } from "./prologue-credentials.js";
import { createPrologueInference } from "./prologue-inference.js";
import { createSessionMessages } from "./prologue-messages.js";
import { createProjectWork } from "./prologue-project-work.js";
import { createPrologueTaskBoards } from "./prologue-taskboard.js";
import { createPrologueWaits } from "./prologue-waits.js";
import type { DispatchGuards, NodeHost, PrologueNodeAdapterOptions, RoundState } from "./prologue-node-kit.js";
import type { SessionIndexStore } from "./prologue-session-index.js";

/**
 * The coordination parts of the Node composition (W4-06): the project's work under way, messages between sessions,
 * parked sessions and background commands, the rounds' step boards, and the inference client with its builder agents.
 */

/** The project's work under way, on one standing SDK graph per project; what each item covers is kept beside it. */
export function createNodeProjectWork(options: PrologueNodeAdapterOptions, host: NodeHost, runtime: Runtime, state: RoundState) {
  const workKind = `molis-project-work-${createHash("sha256").update(options.app.appId).digest("hex").slice(0, 24)}`;
  const workVersions = new Map<string, number>();
  return createProjectWork(runtime, {
    async load(project) {
      const record = await host.storage.get({ kind: workKind, id: project });
      if (!record || record.tombstoned) return {};
      workVersions.set(project, record.version);
      const bytes = await host.storage.readSecure({ kind: workKind, id: project });
      try { return JSON.parse(new TextDecoder().decode(bytes)); } finally { bytes.fill(0); }
    },
    async save(project, scopes) {
      const bytes = new TextEncoder().encode(JSON.stringify(scopes));
      try {
        const record = await host.storage.commit({ kind: workKind, id: project, expectedVersion: workVersions.get(project) ?? 0, metadata: { schema: 1 }, secureBody: bytes });
        workVersions.set(project, record.version);
      } finally { bytes.fill(0); }
    },
  }, runId => state.runWork.has(runId));
}

/** Messages between sessions, waits and background commands, and the rounds' step boards. */
export function createNodeCoordination(runtime: Runtime, index: SessionIndexStore, state: RoundState, projectWork: ReturnType<typeof createProjectWork>) {
  /** Tell a session's main round that is running now; false when it has none. */
  const steerSession = async (sessionId: string, text: string) => {
    const run = state.liveSessions.get(sessionId), active = run ? state.activeRuns.get(run) : undefined;
    if (!active?.live()) return false;
    await active.steer(text);
    return true;
  };
  const messages = createSessionMessages(runtime, {
    async owner(sessionId) {
      const saved = await index.read(sessionId).catch(() => undefined);
      if (saved) return { project: saved.owner.project_id, ref: saved.ref, subtask: Boolean(saved.parent_run) };
      // A subtask with nothing for the Host to review keeps no index of its own: it is its parent's.
      const child = runtime.subagents.list().find(one => one.session.id === sessionId);
      const parent = child && await index.read(child.parentSession.id).catch(() => undefined);
      return parent ? { project: parent.owner.project_id, ref: child!.session, subtask: true } : undefined;
    },
    async title(project, sessionId) {
      const listed = (await projectWork.read(project).catch(() => ({ items: [] }))).items.find(item => item.session_id === sessionId);
      return listed?.title ?? (await index.read(sessionId).catch(() => undefined))?.title ?? sessionId;
    },
    steer: (sessionId, text) => steerSession(sessionId, text),
    async overlapping(sessionId) {
      // The files this session's round under way names or wrote, against the other work under way in its directory.
      const saved = await index.read(sessionId).catch(() => undefined);
      if (!saved) return [];
      const project = saved.owner.project_id, mine = (await projectWork.read(project)).items.find(item => item.session_id === sessionId && item.state === "running");
      if (!mine) return [];
      const seen = await projectWork.read(project, { session_id: sessionId, directory: mine.directory, paths: mine.paths });
      return [...new Set(seen.overlaps.map(overlap => overlap.work.session_id))];
    },
  });
  /** The project's waits and continuations, and background commands (the SDK hands a wait that is over to a live round). */
  const waitsPort = createPrologueWaits(runtime, {
    project: async sessionId => (await index.read(sessionId).catch(() => undefined))?.owner.project_id,
    title: async sessionId => {
      const saved = await index.read(sessionId).catch(() => undefined);
      if (!saved) return sessionId;
      return (await projectWork.read(saved.owner.project_id).catch(() => ({ items: [] }))).items.find(item => item.session_id === sessionId)?.title ?? saved.title;
    },
  });
  const stepBoards = createPrologueTaskBoards(runtime, async run => {
    const saved = await index.read(run.session_id), attempt = saved?.attempts.find(attempt => attempt.run_id === run.run_id);
    return attempt && { ...attempt, session: saved!.ref };
  }, async (run, text) => {
    // Only a round still running hears about changes; a settled one reads the graph when it next starts.
    const active = state.activeRuns.get(run.run_id);
    if (!active?.live()) return false;
    await active.steer(text);
    return true;
  }, async sessionId => {
    const saved = await index.read(sessionId);
    return saved ? projectWork.projectId(saved.owner.project_id) : undefined;
  }, sessionId => state.liveSessions.has(sessionId));
  return { messages, waitsPort, stepBoards };
}

/** The inference client, and the plugin builder agents it hands out (closed with the runtime). */
export function createNodeInference(runtime: Runtime, options: PrologueNodeAdapterOptions, credentials: PrologueCredentialBridge, dispatchGuards: DispatchGuards) {
  const inference = createPrologueInference(runtime, async (input, signal, optional) => {
    const normalize = (value: string | null) => value?.trim() ? value : null;
    signal.throwIfAborted();
    await input.beforeDispatch?.();
    const snapshot = normalize(await input.resolveCredential(input.credential_ref));
    signal.throwIfAborted();
    const assertCurrent = async () => {
      signal.throwIfAborted();
      if (normalize(await input.resolveCredential(input.credential_ref)) !== snapshot) throw new Error("模型凭据或配置已改变");
      signal.throwIfAborted();
    };
    if (optional && snapshot === null) return { assertCurrent };
    if (snapshot === null) throw new Error("模型凭据不可用");
    const ref = await credentials.prologueRefFor(input.credential_ref, async () => { await assertCurrent(); return snapshot; }, signal);
    return { ref, assertCurrent };
  }, (guard, operation) => dispatchGuards.run(guard, operation));
  const builders = new Set<Awaited<ReturnType<typeof createPluginBuilderAgent>>>();
  let closingBuilders = false;
  const createBuilderAgent = async (input: PluginBuilderAgentOptions) => {
    if (closingBuilders) throw new Error("Agent 服务已关闭");
    const builder = await createPluginBuilderAgent(input, { runtime, writable: Boolean(options.reviewQueue),
      credentialRefFor: ref => credentials.prologueRefFor(ref, input.resolveCredential),
      withDispatchGuard: (guard, operation) => dispatchGuards.run(guard, operation) });
    if (closingBuilders) { await builder.close(); throw new Error("Agent 服务已关闭"); }
    builders.add(builder);
    const close = builder.close.bind(builder);
    builder.close = async () => { try { await close(); } finally { builders.delete(builder); } };
    return builder;
  };
  const close = async () => {
    closingBuilders = true;
    await Promise.all([inference.close(), ...[...builders].map(builder => builder.close())]);
  };
  return { inference, createBuilderAgent, close };
}
