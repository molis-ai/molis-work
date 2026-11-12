import type { Readable } from "node:stream";
import { withContextJourneys } from "./context-onboarding-store.js";
import { adoptContextJourney, reopenContextJourney, selectContextSources, stageContextFile, startContextJourney, updateContextDraft,
  type ContextOnboardingPorts } from "./context-onboarding-service.js";
import { webEntryDoor, webEntryProvider } from "./web-entry-actions.js";

/** What the onboarding page's route hands its actions for one request: the Home, the journey's ports and, for a file, the request body itself. */
export interface ContextOnboardingEntry {
  readonly home: string;
  readonly ports: ContextOnboardingPorts;
  /** One chosen file streams from the request into staging as before (no size limit, user 2026-10-22); never an action input. */
  readonly body?: Readable;
}

export const contextOnboardingDoor = webEntryDoor<ContextOnboardingEntry>("onboarding:context", "整理旅程只接受本人在首次引导页里的操作");

const journey = { type: "string", minLength: 1, maxLength: 200, pattern: "^[a-z0-9-]+$" } as const;
// A body's fields and the messages about them stay the journey's own checks (selectContextSources, updateContextDraft, adoptContextJourney).
const body = { type: "object", additionalProperties: true } as const;
const scope = "home", door = contextOnboardingDoor;

export const contextOnboardingActions = {
  create: door.define({ capability_id: "onboarding.context.create", version: /* @version action.onboarding.context.create */ 1, scope,
    title: "开始一轮整理", description: "首次引导：建一轮整理旅程，之后选来源。",
    input_schema: { type: "object", properties: { id: { type: "string", maxLength: 200 } }, additionalProperties: false } },
  (entry, input) => withContextJourneys(entry.home, store => store.create(input.id ?? ""))),
  stageFile: door.define({ capability_id: "onboarding.context.stage_file", version: /* @version action.onboarding.context.stage_file */ 1, scope,
    title: "暂存一份原文件", description: "首次引导：把本人选的一份文件按内容摘要存进这一轮的暂存，供选择引用。",
    input_schema: { type: "object", properties: { journey, path: { type: ["string", "null"], maxLength: 4096 } }, required: ["journey", "path"], additionalProperties: false } },
  async (entry, input) => {
    if (!entry.body) throw new Error("请求里没有文件");
    return stageContextFile(entry.home, input.journey, input.path, entry.body);
  }),
  select: door.define({ capability_id: "onboarding.context.select", version: /* @version action.onboarding.context.select */ 1, scope,
    title: "保存整理来源", description: "首次引导：保存这一轮的来源范围与预览。",
    input_schema: { type: "object", properties: { journey, body }, required: ["journey", "body"], additionalProperties: false } },
  (entry, input) => selectContextSources(entry.home, input.journey, { ...input.body })),
  start: door.define({ capability_id: "onboarding.context.start", version: /* @version action.onboarding.context.start */ 1, scope, metered: true,
    title: "开始整理", description: "首次引导：进入读取阶段并在后台整理这一轮的来源。",
    input_schema: { type: "object", properties: { journey }, required: ["journey"], additionalProperties: false } },
  (entry, input) => startContextJourney(entry.home, input.journey, entry.ports)),
  reopen: door.define({ capability_id: "onboarding.context.reopen", version: /* @version action.onboarding.context.reopen */ 1, scope,
    title: "回到选择来源", description: "首次引导：这一轮回到选择阶段。",
    input_schema: { type: "object", properties: { journey }, required: ["journey"], additionalProperties: false } },
  (entry, input) => reopenContextJourney(entry.home, input.journey)),
  draft: door.define({ capability_id: "onboarding.context.draft", version: /* @version action.onboarding.context.draft */ 1, scope,
    title: "保存整理草稿", description: "首次引导：保存本人改过的摘要标题与正文。",
    input_schema: { type: "object", properties: { journey, body }, required: ["journey", "body"], additionalProperties: false } },
  (entry, input) => updateContextDraft(entry.home, input.journey, { ...input.body })),
  adopt: door.define({ capability_id: "onboarding.context.adopt", version: /* @version action.onboarding.context.adopt */ 1, scope,
    title: "采用整理结果", description: "首次引导：固定确认的内容，建项目并把内容存进 Pages、成果库与 Todo。",
    input_schema: { type: "object", properties: { journey, body }, required: ["journey", "body"], additionalProperties: false } },
  (entry, input) => adoptContextJourney(entry.home, input.journey, { ...input.body }, entry.ports)),
};

export const contextOnboardingProvider = () => webEntryProvider("system.onboarding", "首次引导", Object.values(contextOnboardingActions));
