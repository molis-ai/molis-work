import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { randomUUID } from "node:crypto";

import type {
  AgentCommandOutput,
  AgentCommandOutputRef,
  AgentCreateSessionInput,
  AgentHostErrorCode,
  AgentRunControl,
  AgentRunHandle,
  AgentRunPhase,
  AgentRunRef,
  AgentRunView,
  AgentRuntimeAdapter,
  AgentStartExecution,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
  AgentRuntimeHealth,
  AgentSessionRef,
  AgentSessionView,
  AgentStartRequest,
} from "@molis-ai/molis-work-contracts/services/agent-host";

import { emptyCapabilityMatrix } from "../capabilities.js";
import { applyCliStreamLine, emptyStreamState, type CliStreamState } from "./cli-stream.js";

/**
 * Drives a coding CLI (Claude Code, Codex) as a child process and projects its
 * `stream-json` output into the Agent contract.
 *
 * **Read-only by construction.** Writes and commands stay `unsupported`, not
 * because the CLI cannot do them, but because its approvals happen inside its
 * own permission model and never reach the Host Review queue. Reporting them as
 * supported would let a Run write with no recorded approval. Routing them needs
 * a permission-prompt tool that answers from the Host queue; until that exists,
 * this adapter refuses.
 */

export type CliProcessEvent =
  | { kind: "line"; line: string }
  | { kind: "exit"; code: number | null };

export interface CliProcessHandle {
  /** Resolves once the process has exited. */
  readonly done: Promise<void>;
  kill(): void;
}

/** Spawning is injected so the adapter is testable without a real CLI. */
export interface CliProcessPort {
  spawn(input: {
    command: string;
    args: string[];
    cwd: string;
    onEvent: (event: CliProcessEvent) => void;
  }): CliProcessHandle;
  /** Filesystem discovery only; must not execute the command or inspect credentials. */
  available(command: string): Promise<boolean>;
}

export class CliAgentError extends Error {
  constructor(
    readonly code: Extract<AgentHostErrorCode,
      | "agent.session_unknown"
      | "agent.run_unknown"
      | "agent.capability_unavailable"
      | "agent.runtime_missing">,
    message: string,
  ) {
    super(message);
    this.name = "CliAgentError";
  }
}

export interface CliAgentAdapterOptions {
  runtime_id: string;
  display_name: string;
  /** Executable name or absolute path. */
  command: string;
  process: CliProcessPort;
  /** Model passed through to the CLI. A Host fact; the adapter never picks one. */
  model(): Promise<string | null>;
  /** Read-only tool allowlist handed to the CLI. */
  readOnlyTools?: readonly string[];
  /** Tools the CLI must refuse even if asked. */
  deniedTools?: readonly string[];
  now?: () => Date;
}

/** Role prompts first, then the user's task. Order is the composition. */
function composePrompt(
  prompts: readonly { body: string }[],
  task: string,
): string {
  const bodies = prompts.map((prompt) => prompt.body).filter((body) => body.trim() !== "");
  return bodies.length === 0 ? task : [...bodies, task].join("\n\n");
}

const DEFAULT_READ_TOOLS = ["Read", "Grep", "Glob"] as const;
const DEFAULT_DENIED_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"] as const;

/**
 * A provider session id the CLI actually reported.
 * Empty or unusable values are not a resume; the Host session id is never substituted.
 */
function usableProviderSessionId(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0 || value.length > 256) return undefined;
  if (/[\0\r\n]/.test(value)) return undefined;
  return value;
}

function capabilities(): AgentRuntimeCapabilityMatrix {
  const matrix = emptyCapabilityMatrix();
  matrix["session.create"] = "supported";
  matrix["session.read"] = "supported";
  matrix["session.resume"] = "supported";
  matrix["run.start"] = "supported";
  matrix["run.observe"] = "supported";
  // Stop works by ending the process; pause and resume have no CLI equivalent.
  matrix["run.control"] = "partial";
  // It can say what a command produced, but not run one under Host approval —
  // `command` stays unsupported right below.
  matrix["command.receipts"] = "supported";
  matrix.usage = "supported";
  return matrix;
}

interface HostSessionRecord {
  title: string;
  cwd: string;
  runs: AgentRunRef[];
  owner: AgentSessionView["owner"];
  /** Set from the CLI stream. Absent means this Host session has nothing to resume. */
  providerSessionId?: string;
}

interface RunRecord {
  view: AgentRunView;
  state: CliStreamState;
  handle: CliProcessHandle | null;
  listeners: Set<(view: AgentRunView) => void>;
  stopping: boolean;
}

export class CliAgentAdapter implements AgentRuntimeAdapter {
  readonly descriptor: AgentRuntimeDescriptor;
  readonly #options: CliAgentAdapterOptions;
  readonly #now: () => Date;
  readonly #sessions = new Map<string, HostSessionRecord>();
  readonly #runs = new Map<string, RunRecord>();

  constructor(options: CliAgentAdapterOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
    this.descriptor = {
      runtime_id: options.runtime_id,
      display_name: options.display_name,
      provider_version: "unknown",
      capabilities: capabilities(),
    };
  }

  async health(): Promise<AgentRuntimeHealth> {
    const available = await this.#options.process.available(this.#options.command);
    if (!available) {
      return {
        ok: false,
        status: "unavailable",
        message: `找不到可执行的 ${this.#options.command}`,
        action: `安装 ${this.#options.display_name} 并确认它在 PATH 里`,
      };
    }
    if (await this.#options.model() === null) {
      return {
        ok: false,
        status: "needs_setup",
        message: "还没有选择模型",
        action: "在全局设置里为这个运行时选择模型",
      };
    }
    return { ok: true, status: "ready", message: `${this.#options.display_name} 已检测到可执行程序；登录状态在执行时确认` };
  }

  async createSession(input: AgentCreateSessionInput): Promise<AgentSessionRef> {
    if (input.workspace === "none" || !input.directory?.realpath_verified) throw new CliAgentError("agent.capability_unavailable", "CLI 需要明确授权的工作目录");
    const sessionId = randomUUID();
    this.#sessions.set(sessionId, {
      title: input.title,
      owner: { board_id: input.board_id, plugin_id: input.plugin_id, install_id: input.install_id, actor_id: input.actor_id },
      cwd: input.directory.canonical_path,
      runs: [],
    });
    return { session_id: sessionId, runtime_id: this.descriptor.runtime_id };
  }

  async readSession(session: AgentSessionRef): Promise<AgentSessionView> {
    const record = this.#requireSession(session.session_id);
    const latest = record.runs.at(-1);
    return {
      session: { ...session },
      owner: { ...record.owner },
      title: record.title,
      runs: record.runs.map((ref) => ({ ...ref })),
      latest_run: latest ? structuredClone(this.#requireRun(latest.run_id).view) : null,
    };
  }

  async start(request: AgentStartRequest, execution?: AgentStartExecution): Promise<AgentRunHandle> {
    if (request.workspace === "none" || !request.directory?.realpath_verified) throw new CliAgentError("agent.capability_unavailable", "CLI 需要明确授权的工作目录");
    if (request.execution_plan) throw new CliAgentError("agent.capability_unavailable", "此 CLI 运行时尚未接通计划步骤回报，请使用 Prologue");
    if (request.text_materials?.length) throw new CliAgentError("agent.capability_unavailable", "此 CLI 运行时尚未接通固定材料消费，请使用 Prologue 或移除材料");
    const session = this.#requireSession(request.session.session_id);
    const model = await this.#options.model();
    if (model === null) {
      throw new CliAgentError("agent.runtime_missing", "还没有选择模型");
    }
    const at = this.#now().toISOString();
    const ref: AgentRunRef = {
      run_id: `${request.session.session_id}:${session.runs.length + 1}`,
      session_id: request.session.session_id,
    };
    // The Plugin's role prompts are what make a role mean anything on a CLI
    // runtime. Refusing here is better than running an unshaped agent.
    const role = request.role;
    if (role?.character) throw new CliAgentError("agent.capability_unavailable", "此 CLI 尚未验证 Character 的工具限制，请使用 Prologue 或明确移除角色后执行");
    if (role === undefined) {
      throw new CliAgentError(
        "agent.runtime_missing",
        "宿主没有冻结角色定义，不能在没有角色 Prompt 的情况下起跑",
      );
    }
    const state = emptyStreamState();
    state.turns.push({ turn_id: "user-1", kind: "user", text: request.task, at });

    const view: AgentRunView = {
      ref,
      phase: "starting",
      frozen: {
        role_id: role.role_id,
        role_version: role.version,
        execution: role.execution,
        model_id: model,
        prompts: role.prompts.map((prompt) => ({
          prompt_id: prompt.prompt_id,
          version: prompt.version,
          layer: promptLayerOf(prompt),
        })),
        skills: [],
        mcp_tools: [],
        host_tools: [...role.host_tools],
        text_materials: (request.text_materials ?? []).map((material) => ({
          material_id: material.material_id,
          source_artifact_id: material.source_artifact_id,
          source_version: material.source_version,
        })),
        budget: request.budget ?? null,
        directory: request.directory,
      },
      turns: [...state.turns],
      activity: [],
      usage: state.usage,
      // This CLI's stream carries no structured question, so there is never
      // one to show. Empty is the true answer, not a placeholder.
      awaiting_input: [],
      started_at: at,
      ended_at: null,
    };
    const record: RunRecord = { view, state, handle: null, listeners: new Set(), stopping: false };
    await execution?.beforeStart?.();
    this.#runs.set(ref.run_id, record);
    session.runs.push(ref);

    const resumeId = usableProviderSessionId(session.providerSessionId);
    const handle = this.#options.process.spawn({
      command: this.#options.command,
      args: this.#arguments(model, composePrompt(role.prompts, request.task), resumeId),
      cwd: request.directory.canonical_path,
      onEvent: (event) => this.#onProcessEvent(ref.run_id, event),
    });
    record.handle = handle;
    this.#update(ref.run_id, { phase: "running" });
    return { ref, frozen: view.frozen };
  }

  async read(run: AgentRunRef): Promise<AgentRunView> {
    return structuredClone(this.#requireRun(run.run_id).view);
  }

  observe(run: AgentRunRef, listener: (view: AgentRunView) => void): () => void {
    const record = this.#requireRun(run.run_id);
    record.listeners.add(listener);
    listener(structuredClone(record.view));
    return () => {
      record.listeners.delete(listener);
    };
  }

  async control(run: AgentRunRef, control: AgentRunControl): Promise<void> {
    const record = this.#requireRun(run.run_id);
    if (control.kind !== "stop" && control.kind !== "cancel") {
      throw new CliAgentError(
        "agent.capability_unavailable",
        `${this.#options.display_name} 不支持${control.kind === "steer" ? "补充要求" : "暂停/恢复"}`,
      );
    }
    record.stopping = true;
    record.handle?.kill();
    this.#update(run.run_id, {
      phase: control.kind === "stop" ? "stopped" : "cancelled",
      stop_reason: control.kind === "stop" ? "用户停止" : "已取消",
      ended_at: this.#now().toISOString(),
    });
  }

  /**
   * What one command this Run ran produced.
   *
   * Reading a receipt is not running a command: this Runtime still reports
   * `command` as unsupported, because its execution is gated by the CLI's own
   * permission model rather than the Host's approval queue. What it can do
   * honestly is say what already happened.
   */
  async readCommandOutput(
    session: AgentSessionRef,
    ref: AgentCommandOutputRef,
  ): Promise<AgentCommandOutput> {
    const matches: AgentCommandOutput[] = [];
    for (const record of this.#runs.values()) {
      if (record.view.ref.session_id !== session.session_id || ref.run_id && ref.run_id !== record.view.ref.run_id) continue;
      for (const receipt of record.state.receipts) if (receipt.ref.call_id === ref.call_id) {
        matches.push({ ...structuredClone(receipt), ref: { ...receipt.ref, run_id: record.view.ref.run_id } });
      }
    }
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) throw new CliAgentError("agent.run_unknown", "命令引用对应多次执行，请指定轮次");
    throw new CliAgentError(
      "agent.run_unknown",
      `这条会话里没有 ${ref.call_id} 这次命令的回执`,
    );
  }

  /** Read-only invocation. The denied list is the enforcement, not a suggestion. */
  #arguments(model: string, prompt: string, resumeSessionId: string | undefined): string[] {
    const allowed = [...(this.#options.readOnlyTools ?? DEFAULT_READ_TOOLS)].join(",");
    const denied = [...(this.#options.deniedTools ?? DEFAULT_DENIED_TOOLS)].join(",");
    const args = [
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--model",
      model,
      "--allowedTools",
      allowed,
      "--disallowedTools",
      denied,
    ];
    if (resumeSessionId !== undefined) args.push("--resume", resumeSessionId);
    args.push(prompt);
    return args;
  }

  #onProcessEvent(runId: string, event: CliProcessEvent): void {
    const record = this.#runs.get(runId);
    if (!record) return;
    const at = this.#now().toISOString();

    if (event.kind === "line") {
      if (!applyCliStreamLine(record.state, event.line, at)) return;
      this.#rememberProviderSession(record);
      this.#update(runId, {
        turns: [...record.state.turns],
        activity: [...record.state.activity],
        usage: record.state.usage,
      });
      return;
    }

    if (record.stopping) return;
    const result = record.state.result;
    const phase: AgentRunPhase = result === undefined
      ? "failed"
      : result.ok
        ? "completed"
        : "failed";
    this.#update(runId, {
      phase,
      ended_at: at,
      ...(phase === "failed"
        ? { stop_reason: result?.reason ?? `进程退出码 ${event.code ?? "未知"}` }
        : {}),
    });
  }

  #update(runId: string, patch: Partial<AgentRunView>): void {
    const record = this.#runs.get(runId);
    if (!record) return;
    record.view = { ...record.view, ...patch };
    const snapshot = structuredClone(record.view);
    for (const listener of record.listeners) listener(structuredClone(snapshot));
  }

  #rememberProviderSession(record: RunRecord): void {
    const providerSessionId = usableProviderSessionId(record.state.sessionId);
    if (!providerSessionId) return;
    const session = this.#sessions.get(record.view.ref.session_id);
    if (!session) return;
    const latest = session.runs.at(-1);
    // A late line from an older run must not replace the id a newer run owns.
    if (latest && latest.run_id !== record.view.ref.run_id) return;
    session.providerSessionId = providerSessionId;
  }

  #requireSession(sessionId: string) {
    const record = this.#sessions.get(sessionId);
    if (!record) throw new CliAgentError("agent.session_unknown", "找不到这条会话");
    return record;
  }

  #requireRun(runId: string): RunRecord {
    const record = this.#runs.get(runId);
    if (!record) throw new CliAgentError("agent.run_unknown", "找不到这次执行");
    return record;
  }
}
