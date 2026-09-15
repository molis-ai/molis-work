import { randomUUID } from "node:crypto";
import { MolisWorkWebServiceError, type MolisWorkWebServiceManagerOptions, type MolisWorkWebServiceDetection, type MolisWorkWebServiceAction, type MolisWorkWebServicePlan, type MolisWorkWebServiceResult, type MolisWorkWebServiceRestartPending, type PreparedServicePlan } from "./web-service-contract.js";
import { WebServiceEnvironment, readText, digest } from "./web-service-platform.js";
import { detectWebService } from "./web-service-detection.js";
import { WebServiceProcess } from "./web-service-process.js";
import { WebServiceOperations } from "./web-service-operations.js";
import { planStatus, serviceChanges, confirmationFor, planMessage, resultMessage } from "./web-service-planning.js";

/** Public preview/confirm boundary. OS transitions and rollback have separate owners below it. */
export class MolisWorkWebServiceManager {
  readonly homeDirectory: string;
  readonly userHomeDirectory: string;
  readonly plistPath: string;
  readonly receiptPath: string;
  readonly stdoutLog: string;
  readonly stderrLog: string;
  private readonly environment: WebServiceEnvironment;
  private readonly process: WebServiceProcess;
  private readonly operations: WebServiceOperations;
  private readonly plans = new Map<string, PreparedServicePlan>();
  constructor(options: MolisWorkWebServiceManagerOptions = {}) {
    this.environment = new WebServiceEnvironment(options);
    this.homeDirectory = this.environment.homeDirectory;
    this.userHomeDirectory = this.environment.userHomeDirectory;
    this.plistPath = this.environment.plistPath;
    this.receiptPath = this.environment.receiptPath;
    this.stdoutLog = this.environment.stdoutLog;
    this.stderrLog = this.environment.stderrLog;
    this.process = new WebServiceProcess(this.environment);
    this.operations = new WebServiceOperations(this.environment, this.process);
  }
  detect(): Promise<MolisWorkWebServiceDetection> { return detectWebService(this.environment); }
  async prepare(action: MolisWorkWebServiceAction): Promise<MolisWorkWebServicePlan> {
    const detection = await this.detect();
    const expectedPlist = this.environment.plistSource();
    const managedArtifactsAbsent = await readText(this.plistPath) == null && await readText(this.receiptPath) == null;
    const status = planStatus(action, detection, managedArtifactsAbsent);
    const plan: MolisWorkWebServicePlan = {
      plan_id: `web-service-plan-${randomUUID()}`,
      action,
      status,
      next_action: status === "conflict"
          && detection.state === "needs_repair"
          && (action === "start" || action === "restart")
        ? "service_install"
        : null,
      detection,
      changes: serviceChanges(action, detection, status, this.plistPath),
      confirmation: confirmationFor(action, detection),
      message: planMessage(action, status, detection),
    };
    this.plans.set(plan.plan_id, {
      publicPlan: plan,
      snapshotHash: await this.snapshotHash(),
      expectedPlist,
    });
    return plan;
  }

  async confirm(input: { plan_id: string; decision: "confirmed" | "declined" }): Promise<MolisWorkWebServiceResult> {
    const prepared = await this.consumePlan(input);
    return this.applyPlan(prepared, input.decision);
  }

  /** A Web server cannot bootout itself and then run the following start command. */
  async confirmFromWeb(input: { plan_id: string; decision: "confirmed" | "declined" }, servingProcessId: number): Promise<{
    result: MolisWorkWebServiceResult | MolisWorkWebServiceRestartPending;
    afterResponse?: () => Promise<void>;
  }> {
    const prepared = await this.consumePlan(input);
    if (input.decision === "confirmed" && prepared.publicPlan.action === "restart" && prepared.publicPlan.status === "ready") {
      const detection = await this.detect();
      if (detection.owned && detection.running && await this.process.isRunningProcess(servingProcessId)) {
        let dispatched = false;
        return {
          result: { status: "restarting", action: "restart", previous_process_id: servingProcessId, message: "正在重启常驻服务，等待新进程就绪…" },
          afterResponse: async () => {
            if (dispatched) return;
            dispatched = true;
            // Keep the launchd job loaded: launchd, not the exiting Web process,
            // owns bringing up its replacement. Do not claim readiness here.
            await this.process.restartLoaded();
          },
        };
      }
    }
    return { result: await this.applyPlan(prepared, input.decision) };
  }

  private async consumePlan(input: { plan_id: string; decision: "confirmed" | "declined" }): Promise<PreparedServicePlan> {
    const prepared = this.plans.get(input.plan_id);
    if (!prepared) throw new MolisWorkWebServiceError("service.plan_missing", "常驻服务预览不存在或已失效，请重新预览");
    this.plans.delete(input.plan_id);
    if (input.decision === "declined") {
      return prepared;
    }
    if (prepared.publicPlan.status === "unsupported") throw new MolisWorkWebServiceError("service.unsupported", prepared.publicPlan.message);
    if (prepared.publicPlan.status === "conflict") throw new MolisWorkWebServiceError("service.conflict", prepared.publicPlan.message);
    if (await this.snapshotHash() !== prepared.snapshotHash) {
      throw new MolisWorkWebServiceError("service.plan_stale", "LaunchAgent 状态在预览后发生变化，请重新预览");
    }
    return prepared;
  }

  private async applyPlan(prepared: PreparedServicePlan, decision: "confirmed" | "declined"): Promise<MolisWorkWebServiceResult> {
    if (decision === "declined") {
      return { status: "declined", action: prepared.publicPlan.action, detection: await this.detect(), message: "已取消，没有修改常驻服务" };
    }
    if (prepared.publicPlan.status === "no_change") {
      return { status: "unchanged", action: prepared.publicPlan.action, detection: await this.detect(), message: prepared.publicPlan.message };
    }
    const action = prepared.publicPlan.action;
    let finalDetection: MolisWorkWebServiceDetection | null = null;
    if (action === "install") finalDetection = await this.operations.install(prepared.expectedPlist);
    if (action === "start") {
      finalDetection = prepared.publicPlan.detection.state === "unhealthy"
        ? await this.operations.restart()
        : await this.operations.startPreservingState(prepared.publicPlan.detection.running);
    }
    if (action === "stop") await this.process.stop();
    if (action === "restart") finalDetection = await this.operations.restart();
    if (action === "remove") await this.operations.remove();
    finalDetection ??= await this.detect();
    if (["install", "start", "restart"].includes(action) && finalDetection.state !== "running") {
      throw new MolisWorkWebServiceError(
        "service.command_failed",
        `Molis Work Web 操作后没有保持当前受管实例的运行状态：${finalDetection.message}`,
      );
    }
    const status = ({ install: "installed", start: "started", stop: "stopped", restart: "restarted", remove: "removed" } as const)[action];
    return { status, action, detection: finalDetection, message: resultMessage(action) };
  }

  private async snapshotHash(): Promise<string> {
    return digest(JSON.stringify({ plist: await readText(this.plistPath), receipt: await readText(this.receiptPath) }));
  }
}
