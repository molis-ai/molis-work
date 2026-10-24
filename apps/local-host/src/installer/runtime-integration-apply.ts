import { installerErrors } from "./errors.js";
import { promises as fs, type Stats } from "node:fs";
import { INTEGRATION_OWNER, integrationResult } from "./runtime-integration-contract.js";
import type { IntegrationReceipt, PreparedPlan, RuntimeIntegrationPlan, RuntimeIntegrationResult } from "./runtime-integration-contract.js";
import { fileModeOrUndefined, replaceTextFile, replaceSkillLink, removeExpectedSkillLink, restoreSkillSnapshot,
  restoreTextSnapshot, textWriteMatches, skillWriteMatches } from "./runtime-installation-files.js";

// The resident host has one process; confirmations from separate service objects share this target queue.
const confirmations = new Map<string, Promise<unknown>>();

export async function serializeRuntimeConfirmation<T>(target: string, apply: () => Promise<T>): Promise<T> {
  const previous = confirmations.get(target);
  const pending = (previous ?? Promise.resolve()).catch(() => undefined).then(apply);
  confirmations.set(target, pending);
  try { return await pending; }
  finally { if (confirmations.get(target) === pending) confirmations.delete(target); }
}

interface ApplyPorts {
  homeDirectory: string;
  userHomeDirectory: string;
  receiptPath: string;
  validate(): Promise<boolean>;
  writeBackup(contents: string, mode: number | undefined): Promise<void>;
  writeReceipt(receipt: IntegrationReceipt): Promise<void>;
  writeAttempt(plan: RuntimeIntegrationPlan, status: "rolled_back" | "conflict", message: string): Promise<void>;
}

export async function applyRuntimeIntegration(prepared: PreparedPlan, ports: ApplyPorts): Promise<RuntimeIntegrationResult> {
  const plan = prepared.publicPlan;
  const configPath = prepared.adapter.configPath(ports.userHomeDirectory);
  const skillPath = prepared.adapter.skillPath(ports.userHomeDirectory);
  const expectedSkill = plan.action === "connect" ? prepared.artifacts?.skillSourcePath ?? null : null;
  const originalConfigIdentity = prepared.beforeConfigText == null ? null : await fs.lstat(configPath);
  const originalSkillIdentity = prepared.beforeSkill.state === "absent" ? null : await fs.lstat(skillPath);
  let configMutated = false, skillMutated = false;
  let configIdentity: Stats | null = null, skillIdentity: Stats | null = null;
  try {
    if (prepared.nextConfigText !== prepared.beforeConfigText) {
      if (prepared.beforeConfigText != null && plan.backup_path) {
        const mode = await fileModeOrUndefined(configPath);
        await ports.writeBackup(prepared.beforeConfigText, mode === undefined ? undefined : mode & 0o777);
      }
      if (!await textWriteMatches(configPath, prepared.beforeConfigText, originalConfigIdentity)) {
        throw new Error("Runtime 配置在写入前发生了变化");
      }
      configIdentity = await replaceTextFile(configPath, prepared.nextConfigText, await fileModeOrUndefined(configPath));
      configMutated = true;
    } else if (prepared.nextConfigText != null) configIdentity = await fs.lstat(configPath);
    if (plan.action === "connect") {
      if (!prepared.artifacts) throw installerErrors["installer.installation_invalid"]("Molis Work 安装不可用");
      skillIdentity = await replaceSkillLink(skillPath, prepared.artifacts.skillSourcePath, ports.homeDirectory);
      skillMutated = prepared.beforeSkill.state !== "current";
    } else {
      await removeExpectedSkillLink(skillPath, prepared.receipt?.skill_target ?? "");
      skillMutated = prepared.beforeSkill.state !== "absent";
    }
    if (!await ports.validate()) throw new Error("Runtime 接入验证未通过");
    if (!await textWriteMatches(configPath, prepared.nextConfigText, configIdentity)
      || !await skillWriteMatches(skillPath, expectedSkill, skillIdentity)) {
      throw new Error("Runtime 配置或 Skill 在验证期间发生了变化");
    }
    if (plan.action === "connect") {
      if (!prepared.artifacts) throw installerErrors["installer.installation_invalid"]("Molis Work 安装不可用");
      const inspection = prepared.adapter.inspectConfig(prepared.nextConfigText,
        prepared.adapter.desiredConnection(prepared.artifacts, ports.homeDirectory));
      if (!inspection.entryFingerprint) throw new Error("无法生成 Molis Work 配置所有权指纹");
      await ports.writeReceipt({ schema_version: 1, owner: INTEGRATION_OWNER, runtime_id: plan.runtime_id,
        config_path: configPath, config_entry_fingerprint: inspection.entryFingerprint,
        skill_path: skillPath, skill_target: prepared.artifacts.skillSourcePath, connected_at: new Date().toISOString() });
      return integrationResult("connected", plan.runtime_id, plan.plan_id, plan.backup_path, ports.receiptPath,
        `${plan.display_name} 已接入 Molis Work。${plan.restart_instructions.join(" ")}`);
    }
    await fs.rm(ports.receiptPath, { force: true });
    return integrationResult("removed", plan.runtime_id, plan.plan_id, plan.backup_path, null,
      `${plan.display_name} 的 Molis Work 接入已移除，其他 Runtime 配置保持不变。`);
  } catch (error) {
    const configRestored = await (configMutated
      ? restoreTextSnapshot(configPath, prepared.beforeConfigText, prepared.nextConfigText, configIdentity)
      : textWriteMatches(configPath, prepared.beforeConfigText, originalConfigIdentity)).catch(() => false);
    const skillRestored = await (skillMutated
      ? restoreSkillSnapshot(skillPath, prepared.beforeSkill, expectedSkill, skillIdentity)
      : skillWriteMatches(skillPath, prepared.beforeSkill.rawLinkTarget, originalSkillIdentity)).catch(() => false);
    const status = configRestored && skillRestored ? "rolled_back" : "conflict";
    const message = error instanceof Error ? error.message : String(error);
    await ports.writeAttempt(plan, status, message);
    return integrationResult(status, plan.runtime_id, plan.plan_id, plan.backup_path, null,
      status === "rolled_back" ? `验证失败，已恢复原配置和 Skill：${message}`
        : `验证失败；验证期间改过的配置或 Skill 已保留，本次未完整回滚。原配置备份：${plan.backup_path ?? "无"}。${message}`);
  }
}
