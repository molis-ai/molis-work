/** DOM-independent state controller, also serialized into the settings client. */
export function createConnectorAuthorizationMonitor(ports: {
  read(): Promise<"pending" | "connected" | "cancelled" | "failed" | "expired">;
  connected(): Promise<void>;
  ended(status: "cancelled" | "failed" | "expired"): void;
  refreshFailed(error: unknown): void;
  alive(): boolean;
  expires: number;
  now(): number;
  schedule(run: () => void, ms: number): ReturnType<typeof setTimeout>;
  unschedule(timer: ReturnType<typeof setTimeout>): void;
}) {
  let stopped = false, checking = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = {
    stop() { stopped = true; if (timer !== undefined) ports.unschedule(timer); },
    async check() {
      if (stopped || checking || !ports.alive()) return;
      if (timer !== undefined) ports.unschedule(timer);
      if (ports.now() > ports.expires) { controller.stop(); ports.ended("expired"); return; }
      checking = true;
      let status: Awaited<ReturnType<typeof ports.read>> = "pending";
      try { status = await ports.read(); }
      catch { /* A temporary read failure preserves the pending attempt. */ }
      finally { checking = false; }
      if (stopped || !ports.alive()) return;
      if (status === "connected") {
        controller.stop();
        try { await ports.connected(); } catch (error) { ports.refreshFailed(error); }
        return;
      }
      if (status !== "pending") { controller.stop(); ports.ended(status); return; }
      timer = ports.schedule(() => { void controller.check(); }, 1800);
    },
  };
  timer = ports.schedule(() => { void controller.check(); }, 1200);
  return controller;
}
