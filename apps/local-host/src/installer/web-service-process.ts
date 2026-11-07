import { unboundConfirmation, type ConfirmationAuthority } from "./confirmation-authority.js";
import { installerErrors } from "./errors.js";

import { WebServiceEnvironment, commandError, delay, launchAgentProcessId } from "./web-service-platform.js";

/** Owns launchctl transitions and process-identity readiness, not install files or confirmation. */
export class WebServiceProcess {
  constructor(private readonly environment: WebServiceEnvironment) {}
  async isRunningProcess(processId: number): Promise<boolean> {
    return launchAgentProcessId(await this.environment.launchctl(["print", this.environment.serviceTarget()])) === processId;
  }

  /** launchd owns replacing the process; this deliberately does not claim readiness. */
  async restartLoaded(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    authority.effect();
    const result = await this.environment.launchctl(["kickstart", "-k", this.environment.serviceTarget()]);
    authority.current();
    if (result.code !== 0) throw commandError("重启", result);
  }
  async start(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    await this.assertPortAvailable(authority);
    authority.current();
    await this.startAfterPortCheck(authority);
    authority.current();
  }

  async startAfterPortCheck(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    await this.loadAndWaitForRunning(authority);
    authority.current();
    await this.waitForReady(authority);
    authority.current();
  }

  private async loadAndWaitForRunning(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    authority.effect();
    let bootstrap = await this.environment.launchctl(["bootstrap", this.environment.domainTarget(), this.environment.plistPath]);
    authority.current();
    for (let attempt = 1; bootstrap.code === 37 && attempt < 25; attempt += 1) {
      await delay(this.environment.transitionDelayMilliseconds);
      authority.current();
      authority.effect();
      bootstrap = await this.environment.launchctl(["bootstrap", this.environment.domainTarget(), this.environment.plistPath]);
      authority.current();
    }
    if (bootstrap.code !== 0) {
      if (!/already loaded|service already loaded|Input\/output error/i.test(bootstrap.stderr)) throw commandError("启动", bootstrap);
      authority.effect();
      const kickstart = await this.environment.launchctl(["kickstart", "-k", this.environment.serviceTarget()]);
      authority.current();
      if (kickstart.code !== 0) throw commandError("启动", kickstart);
    }
    await this.waitForRunning(authority);
    authority.current();
  }

  async stop(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    authority.effect();
    const result = await this.environment.launchctl(["bootout", this.environment.serviceTarget()]);
    authority.current();
    if (result.code !== 0 && !/could not find service|no such process/i.test(result.stderr)) {
      throw commandError("停止", result);
    }
    if (result.code === 0) await this.waitForUnloaded(authority);
    authority.current();
  }

  private async waitForUnloaded(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    let status = await this.environment.launchctl(["print", this.environment.serviceTarget()]);
    authority.current();
    for (let attempt = 1; status.code === 0 && attempt < 25; attempt += 1) {
      await delay(this.environment.transitionDelayMilliseconds);
      authority.current();
      status = await this.environment.launchctl(["print", this.environment.serviceTarget()]);
      authority.current();
    }
    if (status.code === 0) {
      throw installerErrors["installer.service.command_failed"]("launchctl 停止超时：旧 Molis Work Web 服务仍在卸载中，请稍后重试");
    }
  }

  private async waitForRunning(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    let status = await this.environment.launchctl(["print", this.environment.serviceTarget()]);
    authority.current();
    for (let attempt = 1; launchAgentProcessId(status) == null && attempt < 25; attempt += 1) {
      await delay(this.environment.transitionDelayMilliseconds);
      authority.current();
      status = await this.environment.launchctl(["print", this.environment.serviceTarget()]);
      authority.current();
    }
    if (launchAgentProcessId(status) == null) {
      throw installerErrors["installer.service.command_failed"](`launchctl 启动后未进入运行状态（${status.code}）：${status.stderr.trim() || "请查看 Molis Work Web 错误日志"}`);
    }
  }

  private async waitForReady(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const status = await this.environment.launchctl(["print", this.environment.serviceTarget()]);
      authority.current();
      const processId = launchAgentProcessId(status);
      if (processId != null && await this.environment.healthCheck(processId)) {
        await delay(this.environment.transitionDelayMilliseconds);
        authority.current();
        const stableStatus = await this.environment.launchctl(["print", this.environment.serviceTarget()]);
        authority.current();
        const stableProcessId = launchAgentProcessId(stableStatus);
        if (stableProcessId != null && await this.environment.healthCheck(stableProcessId)) { authority.current(); return; }
        authority.current();
      } else if (attempt < 24) {
        await delay(this.environment.transitionDelayMilliseconds);
        authority.current();
      }
    }
    throw installerErrors["installer.service.command_failed"](`Molis Work Web 已有 LaunchAgent 进程，但当前实例的进程身份健康检查仍未通过；请查看错误日志：${this.environment.stderrLog}`);
  }

  async restoreRunningState(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    const status = await this.environment.launchctl(["print", this.environment.serviceTarget()]);
    authority.current();
    if (launchAgentProcessId(status) != null) return;
    await this.assertPortAvailable(authority);
    authority.current();
    await this.loadAndWaitForRunning(authority);
    authority.current();
  }

  async assertPortAvailable(authority: ConfirmationAuthority = unboundConfirmation): Promise<void> {
    authority.current();
    if (!await this.environment.portCheck()) return;
    authority.current();
    throw installerErrors["installer.service.conflict"]("127.0.0.1:4173 已有进程监听；Molis Work 不会接管、终止或随机改用其他端口");
  }
}
