import type { AgentPromptLayer } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentFrozenStart } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * What this run was frozen with, as something the user can read.
 *
 * Instructions used to arrive as one joined string, so nobody could tell which
 * part came from the product, which from the role they picked, and which from
 * their project's own conventions. That matters when a run does something
 * unexpected: "why did it refuse to edit" has a different answer depending on
 * which layer said so.
 *
 * **Read only, deliberately.** A surface that could edit a frozen run's
 * instructions would be editing the thing the Host froze to decide what the run
 * is allowed to do — which is the whole point of freezing it. Changing them is
 * changing the role, before the next run.
 */

export interface CodingIdentityLayer {
  layer: AgentPromptLayer;
  title: string;
  /** Who this layer answers to. Shown so attribution is not guesswork. */
  owner: string;
  entries: ReadonlyArray<{ prompt_id: string; version: number; body?: string }>;
  /** Present when the layer is empty, saying why rather than showing nothing. */
  absent_reason?: string;
}

export interface CodingIdentityView {
  role_id: string;
  role_name: string;
  role_version: number;
  execution: AgentFrozenStart["execution"];
  /** What this role may call. Empty is a real answer: it may call nothing. */
  host_tools: readonly string[];
  layers: readonly CodingIdentityLayer[];
  /** Always false. Stated rather than implied, because the shell reads it. */
  editable: false;
}

export interface CodingIdentityInput {
  frozen: AgentFrozenStart;
  /** Display name for the frozen role id, which is internal. */
  role_name: string;
  /** The task the user wrote this time. Empty when the run carried none. */
  task: string;
  /**
   * Bodies for the frozen prompts, when the surface has them. Absent bodies
   * still list the prompt: knowing a layer applied is useful even when its
   * text is not at hand.
   */
  bodies?: ReadonlyMap<string, string>;
}

const LAYER_TITLES: Record<AgentPromptLayer, { title: string; owner: string }> = {
  base: { title: "产品约束", owner: "Molis Work" },
  role: { title: "这一轮的身份", owner: "Coding 插件" },
  project: { title: "项目约定", owner: "这个项目" },
  task: { title: "你的任务", owner: "你" },
};

const ABSENT: Record<AgentPromptLayer, string> = {
  base: "这一轮没有产品层约束",
  role: "这个角色没有自己的补充说明",
  project: "这个项目还没有确认过项目指引",
  task: "这一轮没有带任务文本",
};

/**
 * Group the frozen prompts into layers, in composition order.
 *
 * Every layer appears even when empty, with a reason. A missing section reads
 * as "there is nothing to see"; an empty one that says "this project has stated
 * no conventions" tells the user something they can act on.
 */
export function projectCodingIdentity(input: CodingIdentityInput): CodingIdentityView {
  const layers: CodingIdentityLayer[] = (["base", "role", "project"] as const).map((layer) => {
    const entries = input.frozen.prompts
      .filter((prompt) => prompt.layer === layer)
      .map((prompt) => {
        const body = input.bodies?.get(prompt.prompt_id);
        return body === undefined
          ? { prompt_id: prompt.prompt_id, version: prompt.version }
          : { prompt_id: prompt.prompt_id, version: prompt.version, body };
      });
    return {
      layer,
      ...LAYER_TITLES[layer],
      entries,
      ...(entries.length === 0 ? { absent_reason: ABSENT[layer] } : {}),
    };
  });

  // The task is a layer of the run, but never a declared prompt — it is what
  // the user typed. It is shown last because that is where it composes.
  const task = input.task.trim();
  layers.push({
    layer: "task",
    ...LAYER_TITLES.task,
    entries: task === "" ? [] : [{ prompt_id: "task", version: 1, body: task }],
    ...(task === "" ? { absent_reason: ABSENT.task } : {}),
  });

  return {
    role_id: input.frozen.role_id,
    role_name: input.role_name,
    role_version: input.frozen.role_version,
    execution: input.frozen.execution,
    host_tools: [...input.frozen.host_tools],
    layers,
    editable: false,
  };
}
