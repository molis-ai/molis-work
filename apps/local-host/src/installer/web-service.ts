import { serializeRuntimeConfirmation } from "./runtime-integration-apply.js";
import { type ConfirmationAuthority } from "./confirmation-authority.js";
import { installerErrors } from "./errors.js";
import { randomUUID } from "node:crypto";
import { type MolisWorkWebServiceManagerOptions, type MolisWorkWebServiceDetection, type MolisWorkWebServiceAction, type MolisWorkWebServicePlan, type MolisWorkWebServiceResult, type MolisWorkWebServiceRestartPending, type PreparedServicePlan } from "./web-service-contract.js";
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

  async confirm(input: { plan_id: string; decision: "confirmed" | "declined" }, assertCurrent: () => void = () => {}): Promise<MolisWorkWebServiceResult> {
    return serializeRuntimeConfirmation(this.plistPath, async () => {
      const { prepared, authority } = await this.confirmation(input, assertCurrent);
      const result = await this.applyPlan(prepared, input.decision, authority);
      authority.current(); authority.effect();
      return result;
    });
  }

  /** A Web server cannot bootout itself and then run the following start command. */
  async confirmFromWeb(input: { plan_id: string; decision: "confirmed" | "declined" }, servingProcessId: number,
    assertCurrent: () => void = () => {}): Promise<{ result: MolisWorkWebServiceResult | MolisWorkWebServiceRestartPending; afterResponse?: () => Promise<void> }> {
    return serializeRuntimeConfirmation(this.plistPath, async () => {
    const { prepared, authority } = await this.confirmation(input, assertCurrent);
    if (input.decision === "confirmed" && prepared.publicPlan.action === "restart" && prepared.publicPlan.status === "ready") {
      const detection = await this.detect(); authority.current();
      const running = detection.owned && detection.running && await this.process.isRunningProcess(servingProcessId);
      authority.current();
      if (running) {
        authority.effect(); // Acceptance reserves the existing one-shot plan; the deferred OS act still checks this request.
        let dispatched = false;
        return {
          result: { status: "restarting", action: "restart", previous_process_id: servingProcessId, message: "正在重启常驻服务，等待新进程就绪…" },
          afterResponse: () => serializeRuntimeConfirmation(this.plistPath, async () => {
            if (dispatched) return;
            authority.current();
            dispatched = true;
            await this.process.restartLoaded(authority);
          }),
        };
      }
    }
    const result = await this.applyPlan(prepared, input.decision, authority);
    authority.current(); authority.effect();
    return { result };
    });
  }

  /** Keep an unstarted plan with its shared owner; a withdrawn waiter must not consume it. */
  private async confirmation(input: { plan_id: string; decision: "confirmed" | "declined" }, assertCurrent: () => void) {
    assertCurrent();
    const prepared = this.plans.get(input.plan_id);
    if (!prepared) throw installerErrors["installer.service.plan_missing"]("常驻服务预览不存在或已失效，请重新预览");
    if (input.decision !== "declined") {
      if (prepared.publicPlan.status === "unsupported") throw installerErrors["installer.service.unsupported"](prepared.publicPlan.message);
      if (prepared.publicPlan.status === "conflict") throw installerErrors["installer.service.conflict"](prepared.publicPlan.message);
      const snapshot = await this.snapshotHash(); assertCurrent();
      if (snapshot !== prepared.snapshotHash) throw installerErrors["installer.service.plan_stale"]("LaunchAgent 状态在预览后发生变化，请重新预览");
    }
    let claimed = false;
    const authority: ConfirmationAuthority = {
      current: assertCurrent,
      effect: () => {
        assertCurrent();
        if (claimed) return;
        if (this.plans.get(input.plan_id) !== prepared) throw installerErrors["installer.service.plan_missing"]("常驻服务预览不存在或已失效，请重新预览");
        this.plans.delete(input.plan_id); claimed = true;
      },
    };
    return { prepared, authority };
  }

  private async applyPlan(prepared: PreparedServicePlan, decision: "confirmed" | "declined", authority: ConfirmationAuthority): Promise<MolisWorkWebServiceResult> {
    authority.current();
    if (decision === "declined") {
      return { status: "declined", action: prepared.publicPlan.action, detection: await this.detect(), message: "已取消，没有修改常驻服务" };
    }
    if (prepared.publicPlan.status === "no_change") {
      return { status: "unchanged", action: prepared.publicPlan.action, detection: await this.detect(), message: prepared.publicPlan.message };
    }
    const action = prepared.publicPlan.action;
    let finalDetection: MolisWorkWebServiceDetection | null = null;
    if (action === "install") finalDetection = await this.operations.install(prepared.expectedPlist, authority);
    if (action === "start") {
      finalDetection = prepared.publicPlan.detection.state === "unhealthy"
        ? await this.operations.restart(authority)
        : await this.operations.startPreservingState(prepared.publicPlan.detection.running, authority);
    }
    if (action === "stop") await this.process.stop(authority);
    if (action === "restart") finalDetection = await this.operations.restart(authority);
    if (action === "remove") await this.operations.remove(authority);
    finalDetection ??= await this.detect();
    if (["install", "start", "restart"].includes(action) && finalDetection.state !== "running") {
      throw installerErrors["installer.service.command_failed"](`Molis Work Web 操作后没有保持当前受管实例的运行状态：${finalDetection.message}`);
    }
    authority.current();
    const status = ({ install: "installed", start: "started", stop: "stopped", restart: "restarted", remove: "removed" } as const)[action];
    return { status, action, detection: finalDetection, message: resultMessage(action) };
  }

  private async snapshotHash(): Promise<string> {
    return digest(JSON.stringify({ plist: await readText(this.plistPath), receipt: await readText(this.receiptPath) }));
  }
}
