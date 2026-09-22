import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createPrologueNodeAdapter, prologueModelConfiguration, type ResolvedModelSelection,
} from "@molis-ai/molis-work-service-agent-host";

/** Tests the same SDK/credential path as Coding, with no workspace tools. */
export async function testConfiguredModel(selection: ResolvedModelSelection) {
  const directory = await mkdtemp(path.join(tmpdir(), "molis-model-check-"));
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  try {
    adapter = await createPrologueNodeAdapter({
      app: { appId: "io.molis.work", appVersion: "0.0.0" },
      storageRoot: path.join(directory, "runtime"),
      modelConfiguration: async () => prologueModelConfiguration(selection),
      resolveCredential: (ref) => ref === selection.provider.credential_ref ? selection.api_key : null,
    });
    const session = await adapter.createSession({
      board_id: "model-settings", plugin_id: "host", install_id: "host", actor_id: "user",
      directory: { canonical_path: directory, realpath_verified: true }, title: "模型连接测试",
    });
    const handle = await adapter.start({
      board_id: "model-settings", install_id: "host", actor_id: "user", plugin_id: "host", session, task: "Reply with exactly MOLIS_OK.", role_id: "model-check",
      directory: { canonical_path: directory, realpath_verified: true },
      role: { role_id: "model-check", version: 1, execution: "read-only", prompts: [], host_tools: [] },
    });
    const activeAdapter = adapter;
    const final = await new Promise<Awaited<ReturnType<typeof activeAdapter.read>>>((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => { unsubscribe(); void activeAdapter.control(handle.ref, { kind: "cancel" }); reject(new Error("模型测试超时，请检查配置后重试")); }, 45_000);
      const settle = (view: Awaited<ReturnType<typeof activeAdapter.read>>) => {
        if (!["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return;
        clearTimeout(timer); unsubscribe(); resolve(view);
      };
      unsubscribe = activeAdapter.observe(handle.ref, settle);
    });
    if (final.phase !== "completed") throw new Error(final.stop_reason ?? "模型测试没有完成");
    const text = final.turns.filter((turn) => turn.kind === "assistant").map((turn) => turn.text).join("");
    if (!text.trim()) throw new Error("模型返回了空内容");
    return { ok: true, model_id: selection.model.model_id, message: "模型已实际响应", usage: final.usage };
  } catch (error) {
    const safe = error instanceof Error ? error.message : "模型测试失败";
    throw new Error(safe.replaceAll(selection.api_key, "[凭据已隐藏]"));
  } finally {
    await adapter?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
