import fs from "node:fs";
import path from "node:path";
import { onboardingIntentFrame, type OnboardingIntentFrame } from "@molis-ai/molis-work-app-workbench";

export interface OnboardingRuntimePorts {
  isRuntimeKind(runtimeKind: string): boolean;
  cliAvailability(): Record<string, boolean>;
}

export interface WebOnboardingInitializationInput {
  projectName: string;
  outcome: string;
  intentFrame: OnboardingIntentFrame;
  workspacePath: string | null;
  runtimeKind: string | null;
}

function hasMeaningfulOnboardingText(value: string): boolean {
  return /\p{L}/u.test(value);
}

export function webOnboardingInitializationInput(body: Record<string, unknown>, runtime: OnboardingRuntimePorts): WebOnboardingInitializationInput {
  if (body.user_confirmed !== true) throw new Error("请先确认这次 Project 和根 Goal 写入");
  const projectName = typeof body.project_name === "string" ? body.project_name.trim() : "";
  const outcome = typeof body.outcome === "string" ? body.outcome.trim() : "";
  const intentFrame = body.intent_frame === undefined
    ? "open"
    : onboardingIntentFrame(body.intent_frame);
  const workspacePath = typeof body.workspace_path === "string" && body.workspace_path.trim()
    ? body.workspace_path.trim()
    : null;
  const runtimeKind = typeof body.runtime_kind === "string" && body.runtime_kind.trim()
    ? body.runtime_kind.trim()
    : null;
  if (!hasMeaningfulOnboardingText(projectName)) throw new Error("请填写一个包含文字的项目名称");
  if (projectName.length > 160) throw new Error("项目名称不能超过 160 个字符");
  if (!hasMeaningfulOnboardingText(outcome)) throw new Error("请用一句包含文字的话描述你想看到的结果");
  if (outcome.length > 2_000) throw new Error("结果描述不能超过 2000 个字符");
  if (!intentFrame) throw new Error("请选择一个有效的工作意图");
  if (workspacePath) {
    if (!path.isAbsolute(workspacePath)) throw new Error("工作目录必须是绝对路径");
    let directoryExists = false;
    try {
      directoryExists = fs.statSync(workspacePath).isDirectory();
    } catch {}
    if (!directoryExists) throw new Error("工作目录不存在或当前不可访问");
  }
  if (runtimeKind) {
    if (!runtime.isRuntimeKind(runtimeKind) || runtimeKind === "generic") {
      throw new Error("请选择 Molis Work 支持的 Runtime");
    }
    if (!workspacePath) throw new Error("打开 TUI 前需要选择一个存在的绝对工作目录");
    if (runtime.cliAvailability()[runtimeKind] !== true) {
      throw new Error("这个 Runtime CLI 当前不可用，请重新选择或先不开 TUI");
    }
  }
  return { projectName, outcome, intentFrame, workspacePath, runtimeKind };
}
