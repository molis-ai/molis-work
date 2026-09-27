import { randomUUID } from "node:crypto";
import type { ExactRef, Runtime } from "@prologue/sdk";
import type { AgentProjectWork, AgentProjectWorkOverlap } from "@molis-ai/molis-work-contracts/services/agent-host";

type Board = ReturnType<Runtime["boards"]["get"]>;
type Node = Board["nodes"][number];

/** What a piece of work covers: the directory it runs in, the files it named or wrote. */
export interface ProjectWorkScope {
  session_id: string;
  run_id?: string;
  title: string;
  task: string;
  directory: string;
  paths: string[];
  touched: string[];
}

/** Where the scopes live: one record per project, beside the Host's other records. */
export interface ProjectWorkStore {
  load(project: string): Promise<Record<string, ProjectWorkScope>>;
  save(project: string, scopes: Record<string, ProjectWorkScope>): Promise<void>;
}

const KEEP_FINISHED = 40;
const MAX_PATHS = 40;
const FILE = /(?:^|[\s`'"(（「【：:，,；;@])((?:[\w.@-]+\/)*[\w@-][\w.@-]*\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|vue|svelte|py|rs|go|java|kt|swift|rb|php|c|cc|cpp|h|hpp|yml|yaml|toml|sh|sql|txt|csv))(?=$|[\s`'")）」】：:，,。；;!?！？]|#)/g;
const FOLDER = /(?:^|[\s`'"(（「【：:，,；;@])((?:[\w.@-]+\/)+)(?=$|[\s`'")）」】：:，,。；;])/g;

/** The files and folders a task or plan names, as relative paths (a folder ends with "/"). */
export function workPaths(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of [FILE, FOLDER]) {
    for (const match of text.matchAll(pattern)) {
      const path = match[1]!.replace(/^\.\//, "");
      if (!path || path.startsWith("/") || path.includes("..") || /^https?:/.test(path)) continue;
      found.add(path);
    }
  }
  return [...found].slice(0, MAX_PATHS);
}

/** Two paths overlap when they are the same file, or one is a folder holding the other. */
function overlapping(a: readonly string[], b: readonly string[]): string[] {
  const hit = new Set<string>();
  for (const left of a) for (const right of b) {
    if (left === right || left.endsWith("/") && right.startsWith(left)) hit.add(right);
    else if (right.endsWith("/") && left.startsWith(right)) hit.add(left);
  }
  return [...hit];
}

const STATE: Record<Node["state"], AgentProjectWork["state"]> = { "not-started": "waiting", ready: "waiting", running: "running", blocked: "running",
  succeeded: "done", failed: "failed", cancelled: "stopped" };

/**
 * A project's work under way, on one standing SDK task graph: each round is a node its session holds, and a round
 * waiting for another is a node that depends on it. The graph owns state, holders and waits; the store keeps only
 * what each piece of work covers, so overlaps can be found before and while it runs.
 */
export function createProjectWork(runtime: Runtime, store: ProjectWorkStore, live: (runId: string) => boolean = () => true) {
  const refs = new Map<string, ExactRef<"task-board">>();
  const scopes = new Map<string, Record<string, ProjectWorkScope>>();
  const writes = new Map<string, Promise<unknown>>();
  // One project's changes run one after another: the graph and its scopes move together.
  const serial = <T>(project: string, work: () => Promise<T>): Promise<T> => {
    const next = (writes.get(project) ?? Promise.resolve()).catch(() => undefined).then(work);
    writes.set(project, next.catch(() => undefined));
    return next;
  };
  const board = async (project: string): Promise<ExactRef<"task-board">> => {
    const held = refs.get(project);
    if (held) return held;
    const admitted = await runtime.boards.admit({ nodes: [], idempotencyKey: `molis-project-work:${project}`, standing: { keepFinished: KEEP_FINISHED } });
    refs.set(project, admitted.ref);
    return admitted.ref;
  };
  const scopesOf = async (project: string) => {
    let held = scopes.get(project);
    if (!held) { held = await store.load(project); scopes.set(project, held); }
    return held;
  };
  const persist = async (project: string, graph: Board) => {
    const held = await scopesOf(project), live = new Set(graph.nodes.map(node => node.id));
    // A scope goes when its node has been forgotten by the graph.
    for (const id of Object.keys(held)) if (!live.has(id)) delete held[id];
    await store.save(project, held);
  };
  const item = (node: Node, scope: ProjectWorkScope | undefined): AgentProjectWork => ({
    work_id: node.id, session_id: scope?.session_id ?? (node.assignee?.kind === "session" ? node.assignee.id : ""),
    ...(scope?.run_id ? { run_id: scope.run_id } : {}), title: scope?.title ?? node.title, task: scope?.task ?? "",
    state: STATE[node.state], directory: scope?.directory ?? "", paths: [...new Set([...(scope?.paths ?? []), ...(scope?.touched ?? [])])],
    ...(node.dependsOn.length ? { waits_for: [...node.dependsOn] } : {}),
    updated_at_ms: node.reports.at(-1)?.atMs ?? 0,
  });
  const report = async (ref: ExactRef<"task-board">, id: string, session: ExactRef<"session">, note: string, to?: Node["state"]) => {
    const node = runtime.boards.get(ref).nodes.find(entry => entry.id === id);
    if (!node || node.state === to) return;
    await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: id, by: undefined, session, note: note.slice(0, 480), atMs: Date.now(), ...(to ? { to } : {}) });
  };
  const titleOf = (title: string, task: string) => `「${title.slice(0, 40)}」${task.split("\n")[0]!.slice(0, 70)}`;
  const holder = (node: Node) => node.assignee?.kind === "session" ? node.assignee : undefined;
  const end = (project: string, id: string, phase: string) => serial(project, async () => {
    const ref = await board(project);
    const node = runtime.boards.get(ref).nodes.find(entry => entry.id === id), session = node && holder(node);
    if (!node || !session || !["running", "blocked"].includes(node.state)) return;
    const to = phase === "completed" ? "succeeded" : phase === "failed" ? "failed" : "cancelled";
    await report(ref, id, session, phase === "interrupted" ? "这一轮没有在运行（服务重启或中断），这项工作不再算进行中" : `这一轮结束：${phase}`, to);
    await persist(project, runtime.boards.get(ref));
  });

  return {
    /** The project's work, newest first, with what overlaps a given scope when one is asked about. */
    async read(project: string, probe?: { session_id?: string; directory: string; paths: string[] }): Promise<{ items: AgentProjectWork[]; overlaps: AgentProjectWorkOverlap[] }> {
      const ref = await board(project), held = await scopesOf(project);
      // A round that is no longer running (the service restarted under it) is not work under way.
      for (const node of runtime.boards.get(ref).nodes) {
        const run = held[node.id]?.run_id;
        if (node.state === "running" && run && !live(run)) await end(project, node.id, "interrupted");
      }
      const items = runtime.boards.get(ref).nodes.map(node => item(node, held[node.id])).reverse();
      const overlaps = probe ? items.flatMap(work => {
        if (work.session_id === probe.session_id || !["running", "waiting"].includes(work.state) || work.directory !== probe.directory) return [];
        const paths = overlapping(probe.paths, work.paths);
        return paths.length ? [{ work, paths }] : [];
      }) : [];
      return { items, overlaps };
    },
    /** The graph's id, so a round can read it with board-read. */
    async boardId(project: string) { return (await board(project)).id; },
    /** A round begins: its own item, or the one it waited as. */
    async begin(project: string, input: { session: ExactRef<"session">; run_id: string; title: string; task: string; directory: string; paths: string[]; queued?: string }): Promise<string> {
      return serial(project, async () => {
        const ref = await board(project), held = await scopesOf(project);
        let id = input.queued && runtime.boards.get(ref).nodes.some(node => node.id === input.queued && ["not-started", "ready"].includes(node.state)) ? input.queued : undefined;
        if (id) {
          const node = runtime.boards.get(ref).nodes.find(entry => entry.id === id)!;
          // Starting before what it waited for has finished is the person's choice; the wait is dropped, not faked.
          if (node.state === "not-started") await runtime.boards.rewire({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: id, dependsOn: [] });
        } else {
          id = `w-${randomUUID().slice(0, 12)}`;
          await runtime.boards.addNode({ ref, expectedVersion: runtime.boards.get(ref).version,
            node: { id, title: titleOf(input.title, input.task), dependsOn: [], onFailure: "block-for-human", assignee: input.session } });
        }
        held[id] = { session_id: input.session.id, run_id: input.run_id, title: input.title, task: input.task.slice(0, 200), directory: input.directory,
          paths: input.paths.slice(0, MAX_PATHS), touched: held[id]?.touched ?? [] };
        await report(ref, id, input.session, `开始这一轮${input.paths.length ? "；登记范围：" + input.paths.slice(0, 12).join("、") : ""}`, "running");
        await persist(project, runtime.boards.get(ref));
        return id;
      });
    },
    /** A round has ended; its item ends the same way. */
    end,
    /** A file a round is about to write joins its scope. */
    async touch(project: string, id: string, path: string) {
      return serial(project, async () => {
        const held = await scopesOf(project), scope = held[id];
        if (!scope || scope.touched.includes(path) || scope.paths.includes(path)) return;
        scope.touched = [...scope.touched, path].slice(-MAX_PATHS);
        await store.save(project, held);
      });
    },
    /** A round held back until another piece of work finishes: an item that waits on it. */
    async queue(project: string, input: { session: ExactRef<"session">; title: string; task: string; directory: string; paths: string[]; after: string; person: string }) {
      return serial(project, async () => {
        const ref = await board(project), held = await scopesOf(project);
        const target = runtime.boards.get(ref).nodes.find(node => node.id === input.after);
        if (!target || !["running", "not-started", "ready"].includes(target.state)) throw new Error("要等待的那项工作已经结束或不存在，可以直接开始");
        const id = `w-${randomUUID().slice(0, 12)}`;
        await runtime.boards.addNode({ ref, expectedVersion: runtime.boards.get(ref).version,
          node: { id, title: titleOf(input.title, input.task), dependsOn: [input.after], onFailure: "block-for-human", assignee: input.session } });
        await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: id, by: undefined, human: { kind: "human", id: input.person }, override: true,
          note: `用户决定等「${(held[input.after]?.title ?? target.title).slice(0, 40)}」完成后再开始`, atMs: Date.now() });
        held[id] = { session_id: input.session.id, title: input.title, task: input.task.slice(0, 200), directory: input.directory, paths: input.paths.slice(0, MAX_PATHS), touched: [] };
        await persist(project, runtime.boards.get(ref));
        return item(runtime.boards.get(ref).nodes.find(node => node.id === id)!, held[id]);
      });
    },
    /** A waiting item given up: the person starts it anyway elsewhere, or drops it. */
    async release(project: string, id: string, person: string, note: string) {
      return serial(project, async () => {
        const ref = await board(project);
        const node = runtime.boards.get(ref).nodes.find(entry => entry.id === id);
        if (!node || !["not-started", "ready"].includes(node.state)) return;
        await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: id, by: undefined, human: { kind: "human", id: person }, override: true,
          note: note.slice(0, 480), atMs: Date.now(), to: "cancelled" });
        await persist(project, runtime.boards.get(ref));
      });
    },
  };
}

/** The other work under way in the project, as a round reads it at its start; nothing when there is none. */
export function projectWorkDigest(boardId: string, items: readonly AgentProjectWork[], own: string, overlaps: readonly AgentProjectWorkOverlap[], canSend = false): string {
  const others = items.filter(work => work.session_id !== own && ["running", "waiting"].includes(work.state));
  if (!others.length) return "";
  const line = (work: AgentProjectWork) => `- 会话「${work.title.slice(0, 40)}」（session ${work.session_id}）${work.state === "running" ? "进行中" : "等待开始"}：${work.task.split("\n")[0]!.slice(0, 80)}`
    + `${work.paths.length ? "；范围：" + work.paths.slice(0, 8).join("、") : ""}（目录 ${work.directory}）`;
  return [`项目里其他会话正在做的事（第 ${boardId} 号项目任务图，宿主在这一轮开始时读取；可以用 board-read 读这张图看最新状态，但不能改它）：`,
    ...others.slice(0, 12).map(line),
    ...(overlaps.length ? ["和这一轮登记的范围重叠：", ...overlaps.map(overlap => `- 会话「${overlap.work.title.slice(0, 40)}」也在改 ${overlap.paths.join("、")}`),
      "改这些文件之前先告诉用户重叠在哪里；不要替用户决定谁先谁后。"] : []),
    // A round that can write to other sessions is told how to wait on one it depends on, rather than guessing its result.
    ...(canSend ? ["如果这一轮要做的事依赖上面某个会话正在做的改动（比如它在改你要调用的接口），不要猜它改完的样子：用 session-send 给它发 kind 为 request 的信（to 写它的 session id），说清楚你需要什么，并设 wait: true；然后说明你在等什么，结束这一轮，不做依赖它的部分。它答复或那一轮结束后，宿主会带着答复让你接着做。不依赖就照常做。"] : [])].join("\n");
}
