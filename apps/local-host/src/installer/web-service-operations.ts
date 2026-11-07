import { textWriteMatches, replaceTextFile } from "./runtime-installation-files.js";
import { unboundConfirmation, type ConfirmationAuthority } from "./confirmation-authority.js";
import { installerErrors } from "./errors.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SERVICE_OWNER, SERVICE_LABEL, type MolisWorkWebServiceDetection, type WebServiceReceipt } from "./web-service-contract.js";
import { WebServiceEnvironment, readText, writeAtomic, digest, errorMessage } from "./web-service-platform.js";
import { detectWebService } from "./web-service-detection.js";
import { WebServiceProcess } from "./web-service-process.js";

/** Runs confirmed service operations, preserving files and prior running state on failure. */
export class WebServiceOperations {
  constructor(private readonly environment: WebServiceEnvironment, private readonly process: WebServiceProcess) {}
  private detect(): Promise<MolisWorkWebServiceDetection> { return detectWebService(this.environment); }
  async install(plist: string, authority: ConfirmationAuthority = unboundConfirmation): Promise<MolisWorkWebServiceDetection> {
    authority.current();
    const previousPlist = await readText(this.environment.plistPath);
    authority.current();
    const previousReceipt = await readText(this.environment.receiptPath);
    authority.current();
    const detection = await this.detect();
    authority.current();
    if (detection.state === "conflict") {
      throw installerErrors["installer.service.conflict"](detection.message);
    }
    const previousPlistMode = previousPlist == null ? undefined : (await fs.lstat(this.environment.plistPath)).mode; authority.current();
    const previousReceiptMode = previousReceipt == null ? undefined : (await fs.lstat(this.environment.receiptPath)).mode; authority.current();
    const previouslyRunning = detection.running;
    let serviceMutated = false;
    let plistIdentity: import("node:fs").Stats | null = null, receiptIdentity: import("node:fs").Stats | null = null;
    let receipt = "";
    try {
      if (detection.owned) {
        authority.effect();
        serviceMutated = true;
        await this.process.stop(authority);
        authority.current();
      }
      await this.process.assertPortAvailable(authority);
      authority.current();
      authority.effect();
      await fs.mkdir(path.dirname(this.environment.plistPath), { recursive: true });
      authority.current();
      authority.effect();
      await fs.mkdir(path.dirname(this.environment.receiptPath), { recursive: true });
      authority.current();
      authority.effect();
      await fs.mkdir(path.dirname(this.environment.stdoutLog), { recursive: true });
      authority.current();
      plistIdentity = await writeAtomic(this.environment.plistPath, plist, authority);
      authority.current();
      receipt = `${JSON.stringify({
        schema_version: /* @version format.web.service.receipt */ 1,
        owner: SERVICE_OWNER,
        label: SERVICE_LABEL,
        plist_path: this.environment.plistPath,
        plist_hash: digest(plist),
        installed_at: new Date().toISOString(),
      } satisfies WebServiceReceipt, null, 2)}\n`;
      receiptIdentity = await writeAtomic(this.environment.receiptPath, receipt, authority);
      authority.current();
      authority.effect();
      serviceMutated = true;
      await this.process.start(authority);
      authority.current();
      const finalDetection = await this.detect();
      authority.current();
      if (finalDetection.state !== "running") {
        throw installerErrors["installer.service.command_failed"](`Molis Work Web 安装后没有保持当前受管实例的运行状态：${finalDetection.message}`);
      }
      return finalDetection;
    } catch (error) {
      const rollbackErrors: string[] = [];
      const stillCurrent = () => { try { authority.current(); return true; } catch { return false; } };
      if (serviceMutated && stillCurrent()) await this.process.stop(authority).catch((rollbackError) => rollbackErrors.push(errorMessage(rollbackError)));
      // Restore only files still owned by this exact attempt; a replacement belongs to its writer.
      for (const [target, before, written, identity, mode] of [
        [this.environment.plistPath, previousPlist, plist, plistIdentity, previousPlistMode],
        [this.environment.receiptPath, previousReceipt, receipt, receiptIdentity, previousReceiptMode],
      ] as const) {
        if (identity && await textWriteMatches(target, written, identity)) {
          await replaceTextFile(target, before, mode).catch(rollbackError => rollbackErrors.push(errorMessage(rollbackError)));
        }
      }
      if (serviceMutated && previouslyRunning && previousPlist != null && previousReceipt != null && stillCurrent()) {
        await this.process.restoreRunningState(authority).catch((rollbackError) => rollbackErrors.push(errorMessage(rollbackError)));
      }
      if (!stillCurrent()) throw error;
      if (rollbackErrors.length > 0) {
        throw installerErrors["installer.service.command_failed"](`${errorMessage(error)}；自动恢复未完成：${rollbackErrors.join("；")}`);
      }
      throw error;
    }
  }

  async startPreservingState(previouslyRunning: boolean, authority: ConfirmationAuthority = unboundConfirmation): Promise<MolisWorkWebServiceDetection> {
    authority.current();
    await this.process.assertPortAvailable(authority);
    authority.current();
    let effected = false;
    const originalAuthority = authority;
    authority = { current: () => originalAuthority.current(), effect: () => { originalAuthority.effect(); effected = true; } };
    try {
      await this.process.startAfterPortCheck(authority);
      authority.current();
      return await this.requireRunningDetection("启动", authority);
    } catch (error) {
      if (effected) await this.restoreLaunchctlState(previouslyRunning, error, authority);
      throw error;
    }
  }

  async restart(authority: ConfirmationAuthority = unboundConfirmation): Promise<MolisWorkWebServiceDetection> {
    authority.current();
    const previous = await this.detect();
    authority.current();
    if (previous.state === "conflict") {
      throw installerErrors["installer.service.conflict"](previous.message);
    }
    let effected = false;
    const originalAuthority = authority;
    authority = { current: () => originalAuthority.current(), effect: () => { originalAuthority.effect(); effected = true; } };
    try {
      await this.process.stop(authority);
      authority.current();
      await this.process.assertPortAvailable(authority);
      authority.current();
      await this.process.startAfterPortCheck(authority);
      authority.current();
      return await this.requireRunningDetection("重启", authority);
    } catch (error) {
      if (effected) await this.restoreLaunchctlState(previous.running, error, authority);
      throw error;
    }
  }

  async remove(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    const detection = await this.detect(); authority.current();
    if (!detection.owned) throw installerErrors["installer.service.conflict"]("LaunchAgent 不属于 Molis Work，拒绝移除");
    const beforePlist = await readText(this.environment.plistPath); authority.current();
    const beforeReceipt = await readText(this.environment.receiptPath); authority.current();
    const plistIdentity = await fs.lstat(this.environment.plistPath); authority.current();
    const receiptIdentity = await fs.lstat(this.environment.receiptPath); authority.current();
    let plistRemoved = false, receiptRemoved = false;
    try {
      await this.process.stop(authority); authority.current();
      if (!await textWriteMatches(this.environment.plistPath, beforePlist, plistIdentity)) throw installerErrors["installer.service.plan_stale"]("LaunchAgent 状态在移除前发生变化");
      authority.current(); authority.effect();
      await fs.rm(this.environment.plistPath, { force: true }); plistRemoved = true; authority.current();
      if (!await textWriteMatches(this.environment.receiptPath, beforeReceipt, receiptIdentity)) throw installerErrors["installer.service.plan_stale"]("LaunchAgent 收据在移除前发生变化");
      authority.current(); authority.effect();
      await fs.rm(this.environment.receiptPath, { force: true }); receiptRemoved = true; authority.current();
    } catch (error) {
      // A cancelled remove may restore only the files it removed, never issue a new OS transition.
      for (const [target, before, identity, removed] of [
        [this.environment.plistPath, beforePlist, plistIdentity, plistRemoved],
        [this.environment.receiptPath, beforeReceipt, receiptIdentity, receiptRemoved],
      ] as const) {
        if (removed && await textWriteMatches(target, null, null)) await replaceTextFile(target, before, identity.mode);
      }
      throw error;
    }
  }

  private async requireRunningDetection(action: string, authority: ConfirmationAuthority = unboundConfirmation): Promise<MolisWorkWebServiceDetection> {
    authority.current();
    const detection = await this.detect();
    authority.current();
    if (detection.state === "running") return detection;
    throw installerErrors["installer.service.command_failed"](`Molis Work Web ${action}后没有保持当前受管实例的运行状态：${detection.message}`);
  }

  private async restoreLaunchctlState(previouslyRunning: boolean, originalError: unknown, authority: ConfirmationAuthority): Promise<void> {
    try {
      authority.current();
      if (previouslyRunning) await this.process.restoreRunningState(authority);
      else await this.process.stop(authority);
    } catch (rollbackError) {
      try { authority.current(); } catch { throw originalError; }
      throw installerErrors["installer.service.command_failed"](`${errorMessage(originalError)}；自动恢复操作前运行状态失败：${errorMessage(rollbackError)}`);
    }
  }
}
