import { promises as fs } from "node:fs";
import path from "node:path";
import { SERVICE_OWNER, SERVICE_LABEL, MolisWorkWebServiceError, type MolisWorkWebServiceDetection, type WebServiceReceipt } from "./web-service-contract.js";
import { WebServiceEnvironment, readText, writeAtomic, digest, errorMessage } from "./web-service-platform.js";
import { detectWebService } from "./web-service-detection.js";
import { WebServiceProcess } from "./web-service-process.js";

/** Runs confirmed service operations, preserving files and prior running state on failure. */
export class WebServiceOperations {
  constructor(private readonly environment: WebServiceEnvironment, private readonly process: WebServiceProcess) {}
  private detect(): Promise<MolisWorkWebServiceDetection> { return detectWebService(this.environment); }
  async install(plist: string): Promise<MolisWorkWebServiceDetection> {
    const previousPlist = await readText(this.environment.plistPath);
    const previousReceipt = await readText(this.environment.receiptPath);
    const detection = await this.detect();
    if (detection.state === "conflict") {
      throw new MolisWorkWebServiceError("service.conflict", detection.message);
    }
    const previouslyRunning = detection.running;
    let serviceMutated = false;
    let filesMutated = false;
    try {
      if (detection.owned) {
        serviceMutated = true;
        await this.process.stop();
      }
      await this.process.assertPortAvailable();
      await fs.mkdir(path.dirname(this.environment.plistPath), { recursive: true });
      await fs.mkdir(path.dirname(this.environment.receiptPath), { recursive: true });
      await fs.mkdir(path.dirname(this.environment.stdoutLog), { recursive: true });
      await writeAtomic(this.environment.plistPath, plist);
      filesMutated = true;
      await writeAtomic(this.environment.receiptPath, `${JSON.stringify({
        schema_version: 1,
        owner: SERVICE_OWNER,
        label: SERVICE_LABEL,
        plist_path: this.environment.plistPath,
        plist_hash: digest(plist),
        installed_at: new Date().toISOString(),
      } satisfies WebServiceReceipt, null, 2)}\n`);
      serviceMutated = true;
      await this.process.start();
      const finalDetection = await this.detect();
      if (finalDetection.state !== "running") {
        throw new MolisWorkWebServiceError(
          "service.command_failed",
          `Molis Work Web 安装后没有保持当前受管实例的运行状态：${finalDetection.message}`,
        );
      }
      return finalDetection;
    } catch (error) {
      const rollbackErrors: string[] = [];
      if (serviceMutated || filesMutated) {
        await this.process.stop().catch((rollbackError) => rollbackErrors.push(errorMessage(rollbackError)));
        if (previousPlist == null) {
          await fs.rm(this.environment.plistPath, { force: true }).catch((rollbackError) => rollbackErrors.push(errorMessage(rollbackError)));
        } else {
          await writeAtomic(this.environment.plistPath, previousPlist).catch((rollbackError) => rollbackErrors.push(errorMessage(rollbackError)));
        }
        if (previousReceipt == null) {
          await fs.rm(this.environment.receiptPath, { force: true }).catch((rollbackError) => rollbackErrors.push(errorMessage(rollbackError)));
        } else {
          await writeAtomic(this.environment.receiptPath, previousReceipt).catch((rollbackError) => rollbackErrors.push(errorMessage(rollbackError)));
        }
        if (previouslyRunning && previousPlist != null && previousReceipt != null) {
          await this.process.restoreRunningState().catch((rollbackError) => rollbackErrors.push(errorMessage(rollbackError)));
        }
      }
      if (rollbackErrors.length > 0) {
        throw new MolisWorkWebServiceError(
          "service.command_failed",
          `${errorMessage(error)}；自动恢复未完成：${rollbackErrors.join("；")}`,
        );
      }
      throw error;
    }
  }

  async startPreservingState(previouslyRunning: boolean): Promise<MolisWorkWebServiceDetection> {
    await this.process.assertPortAvailable();
    try {
      await this.process.startAfterPortCheck();
      return await this.requireRunningDetection("启动");
    } catch (error) {
      await this.restoreLaunchctlState(previouslyRunning, error);
      throw error;
    }
  }

  async restart(): Promise<MolisWorkWebServiceDetection> {
    const previous = await this.detect();
    if (previous.state === "conflict") {
      throw new MolisWorkWebServiceError("service.conflict", previous.message);
    }
    try {
      await this.process.stop();
      await this.process.assertPortAvailable();
      await this.process.startAfterPortCheck();
      return await this.requireRunningDetection("重启");
    } catch (error) {
      await this.restoreLaunchctlState(previous.running, error);
      throw error;
    }
  }

  async remove(): Promise<void> {
    const detection = await this.detect();
    if (!detection.owned) throw new MolisWorkWebServiceError("service.conflict", "LaunchAgent 不属于 Molis Work，拒绝移除");
    await this.process.stop();
    await fs.rm(this.environment.plistPath, { force: true });
    await fs.rm(this.environment.receiptPath, { force: true });
  }

  private async requireRunningDetection(action: string): Promise<MolisWorkWebServiceDetection> {
    const detection = await this.detect();
    if (detection.state === "running") return detection;
    throw new MolisWorkWebServiceError(
      "service.command_failed",
      `Molis Work Web ${action}后没有保持当前受管实例的运行状态：${detection.message}`,
    );
  }

  private async restoreLaunchctlState(previouslyRunning: boolean, originalError: unknown): Promise<void> {
    try {
      if (previouslyRunning) await this.process.restoreRunningState();
      else await this.process.stop();
    } catch (rollbackError) {
      throw new MolisWorkWebServiceError(
        "service.command_failed",
        `${errorMessage(originalError)}；自动恢复操作前运行状态失败：${errorMessage(rollbackError)}`,
      );
    }
  }
}
