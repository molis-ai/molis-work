import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";


const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));
const studioBody = (id: string) => { const { body, body_by_locale } = promptBody(id); return { text: body, body_by_locale }; };
export const BUILDER_PROMPTS = {
  experience: { version: /* @version prompt.plugin-builder.experience "experience/{version}" */ "experience/2", ...studioBody("plugin-builder.experience") },
  review: { version: /* @version prompt.plugin-builder.ui-review "ui-review/{version}" */ "ui-review/2", ...studioBody("plugin-builder.ui-review") },
  ui: { version: /* @version prompt.plugin-builder.ui "ui/{version}" */ "ui/2", ...studioBody("plugin-builder.ui") },
  designer: { version: /* @version prompt.plugin-builder.designer "designer/{version}" */ "designer/2", ...studioBody("plugin-builder.designer") },
  implement: { version: /* @version prompt.plugin-builder.implement "implement/{version}" */ "implement/2", ...studioBody("plugin-builder.implement") },
  repair: { version: /* @version prompt.plugin-builder.repair "repair/{version}" */ "repair/2", ...studioBody("plugin-builder.repair") },
  revise: { version: /* @version prompt.plugin-builder.revise "revise/{version}" */ "revise/2", ...studioBody("plugin-builder.revise") },
  acceptance: { version: /* @version prompt.plugin-builder.acceptance "acceptance/{version}" */ "acceptance/2", ...studioBody("plugin-builder.acceptance") },
} as const;

export type BuilderPromptName = keyof typeof BUILDER_PROMPTS;

/** The run label and prompt register share the same first-party integer version (`designer/1` → 1). */
export function builderPromptVersion(name: BuilderPromptName): number {
  return Number(BUILDER_PROMPTS[name].version.split("/")[1]);
}

/** How each prompt reads in “Prompt 与 Character”. */
export const BUILDER_PROMPT_TITLES: Readonly<Record<BuilderPromptName, { title: string; purpose: string; used_by: string[] }>> = {
  experience: { title: "体验设计师", purpose: "在绑定冻结前规划用户动线、信息主次与代表性内容", used_by: ["插件创作台 · 体验"] },
  ui: { title: "UI Agent · 整页设计", purpose: "按用户任务组织整页布局和组件呈现", used_by: ["插件创作台 · 界面"] },
  review: { title: "UI Agent · 视觉复查", purpose: "根据真实截图与组件能力提出有证据的改进意见", used_by: ["插件创作台 · 复查"] },
  designer: { title: "主线设计师", purpose: "理解需求，提出方案、细化与修订插件的产品与功能合同", used_by: ["插件创作台 · 设计"] },
  implement: { title: "代码 Agent · 实现", purpose: "按确定的设计写出插件代码", used_by: ["插件创作台 · 构建"] },
  revise: { title: "代码 Agent · 修改", purpose: "按用户的修改意见改动已有插件代码", used_by: ["插件创作台 · 修改"] },
  repair: { title: "代码 Agent · 修复", purpose: "按宿主检查给出的失败原因修复代码", used_by: ["插件创作台 · 构建"] },
  acceptance: { title: "代码 Agent · 验收", purpose: "按设计里的验收项检查生成的插件", used_by: ["插件创作台 · 验收"] },
};
