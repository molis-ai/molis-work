import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function waitUntil(check: () => Promise<boolean>, timeout = 8000): Promise<void> {
  const deadline = performance.now() + timeout;
  while (!await check()) {
    if (performance.now() >= deadline) throw new Error("Autostart fixture condition timed out");
    await delay(30);
  }
}

/** Let the installed MCP start its real resident on a test port. Only this Home's signed health response may identify processes to stop. */
export async function isolatedMcpResident(home: string) {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const origin = `http://127.0.0.1:${address.port}`;
  const pids = new Set<number>();
  async function health() {
    const token = (await readFile(join(home, "config/web-control-token"), "utf8")).trim();
    const challenge = randomBytes(32).toString("base64url");
    const response = await fetch(`${origin}/health?challenge=${challenge}`, { signal: AbortSignal.timeout(1000) });
    const body = await response.text();
    assert.equal(response.headers.get("x-molis-work-proof"), createHmac("sha256", token).update(`${challenge}\n${body}`).digest("base64url"));
    const value = JSON.parse(body);
    assert.equal(value.status, "ok");
    assert.equal(value.desktop_tui, true);
    assert.ok(Number.isSafeInteger(value.process_id) && value.process_id > 1);
    assert.ok(Number.isSafeInteger(value.service_process_id) && value.service_process_id > 1);
    pids.add(value.process_id);
    pids.add(value.service_process_id);
    return { process_id: value.process_id as number, service_process_id: value.service_process_id as number };
  }
  async function stopHost() {
    const live = await health().catch(() => undefined);
    if (live) {
      for (const pid of new Set([live.service_process_id, live.process_id])) {
        try { process.kill(pid, "SIGTERM"); } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
        }
      }
    }
    await waitUntil(async () => {
      try { await fetch(`${origin}/health`, { signal: AbortSignal.timeout(300) }); return false; }
      catch { return true; }
    });
    await waitUntil(async () => [...pids].every(pid => { try { process.kill(pid, 0); return false; } catch { return true; } }));
    pids.clear();
  }
  return { origin, health, stopHost };
}
