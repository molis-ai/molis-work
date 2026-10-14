import { isDeepStrictEqual } from "node:util";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentManifest, AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { AGENT_PROMPT_MAX_CHARS } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { agentDefinitionsFor } from "./agent-definitions.js";
import { builtinRegistrations } from "./builtin-registrations.js";

export interface HostAgentPromptControl {
  signal?: AbortSignal;
  /** The still-active original request, not an already-returned Agent start invocation. */
  beforeEffect(): void | Promise<void>;
}

export interface HostAgentPromptBinding {
  /** Read only: does not record a model use or start a Runtime. */
  read(control: HostAgentPromptControl): Promise<AgentPromptText[]>;
  /** Refuse dispatch when an effective body/version differs from the consumer's frozen snapshot. */
  assertCurrent(snapshot: readonly AgentPromptText[], control: HostAgentPromptControl): Promise<void>;
  /** Last synchronous check after the caller's awaited authorization and before
   * its synchronous commit. Does not grant permission or record a model use. */
  assertCurrentSync(snapshot: readonly AgentPromptText[]): void;
  /** Close this binding without changing registered methods or saved user edits. */
  dispose(): void;
}

/** Trusted Host assembly only. Bind shipped declarations from the activated release,
 * never an owner, Home or prompt body taken from business JSON. The binding grants no
 * execution rights. AgentHost.start still owns role resolution and usage recording. */
export function bindRegisteredAgentPrompts(options: {
  homeDirectory: string; ownerId: string; version: string; title: string;
  manifest: AgentManifest; prompts: readonly AgentPromptText[];
}): HostAgentPromptBinding {
  const { homeDirectory, ownerId, version, title, manifest, prompts } = structuredClone(options);
  if (!homeDirectory.trim() || !ownerId.trim() || ownerId.includes("/") || !version.trim() || !title.trim()
    || prompts.length !== manifest.prompts.length || new Set(prompts.map(row => row.prompt_id)).size !== prompts.length
    || prompts.some(row => !row.body.trim() || row.body.length > AGENT_PROMPT_MAX_CHARS || row.user_revision !== undefined
      || !manifest.prompts.some(declared => declared.prompt_id === row.prompt_id && declared.version === row.version && declared.layer === row.layer))) {
    throw new ActionError("actions.input_invalid", "Host 的 Agent Prompt 声明不完整或与当前发布版本不一致");
  }
  const registry = agentDefinitionsFor(homeDirectory, builtinRegistrations);
  let closed = false;
  const active = () => { if (closed) throw new ActionError("actions.unavailable", "这份 Agent 方法所属的激活已结束"); };
  const snapshot = () => {
    active();
    return prompts.map(prompt => {
      const view = registry.prompt(`${ownerId}/${prompt.prompt_id}`);
      return { ...prompt, ...(view.user ? { body: view.body, user_revision: view.user.revision } : {}) };
    });
  };
  const read = async (control: HostAgentPromptControl): Promise<AgentPromptText[]> => {
    active(); control.signal?.throwIfAborted();
    await control.beforeEffect();
    active(); control.signal?.throwIfAborted();
    // No await inside the snapshot. Settings may display a newer installation's
    // default, but this consumer always retains its own release's default body.
    return snapshot();
  };
  return {
    read,
    async assertCurrent(snapshot, control) {
      const expected = structuredClone(snapshot);
      if (!isDeepStrictEqual(await read(control), expected)) {
        throw new ActionError("actions.configuration_changed", "生成方法已修改；本次保持原稿，请用新请求明确采用当前方法");
      }
    },
    assertCurrentSync(expected) {
      if (!isDeepStrictEqual(snapshot(), expected)) {
        throw new ActionError("actions.configuration_changed", "生成方法已修改；本次保持原稿，请用新请求明确采用当前方法");
      }
    },
    dispose() { if (!closed) { closed = true; } },
  };
}
