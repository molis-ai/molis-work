import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { defineInstructionPrompt } from '@molis-ai/molis-work-contracts/platform/model-prompts';
import { BUILDER_PLUGIN_ID } from './manifest.js';

const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


/**
 * The two sentences the studio puts to the judgment service (Jev) when a part of a design has more than one legal choice: which
 * capability to build an operation on, and which component to show a part with. Registered so the person can read and change
 * them in 设置 › 提示词 like every other instruction (W3-04); the workflow asks the host for the text it runs with now
 * (`AgentBuilderPorts.instruction`) and falls back to these defaults, which read exactly as the workflow always said them.
 * The legal candidates, the design state and the rule that only a legal candidate counts stay in code.
 */
export const BUILDER_CHOOSE_CAPABILITY = defineInstructionPrompt({
  owner_id: BUILDER_PLUGIN_ID, prompt_id: 'choose.capability', version: /* @version prompt.choose.capability */ 2, title: '选能力',
  purpose: '一项功能有几个都说得通的平台能力时，请判断服务选出最适合的一个；候选和设计状态由创作台给出，只有合法候选算数',
  used_by: ['插件创作台 · 设计'],
  ...promptBody("choose.capability"),
});
export const BUILDER_CHOOSE_COMPONENT = defineInstructionPrompt({
  owner_id: BUILDER_PLUGIN_ID, prompt_id: 'choose.component', version: /* @version prompt.choose.component */ 2, title: '选组件',
  purpose: '一个部件有几个都说得通的组件时，请判断服务按整页布局和相邻部件选出一个；候选和设计状态由创作台给出，只有合法候选算数',
  used_by: ['插件创作台 · 界面'],
  ...promptBody("choose.component"),
});
export const BUILDER_CHOICE_INSTRUCTIONS = [BUILDER_CHOOSE_CAPABILITY, BUILDER_CHOOSE_COMPONENT] as const;
