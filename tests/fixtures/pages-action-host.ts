import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { MolisWorkLocalHost, molisWorkHostProjectReference, type HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { initializeBoard } from "./goals-board.js";

export const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
export async function fixture(run: (f: { home: string; host: MolisWorkLocalHost; caller: ActionCallContext;
  client: ReturnType<MolisWorkLocalHost["actionClient"]>; bound: ReturnType<typeof bindActionClient>;
  ref: ReturnType<typeof molisWorkHostProjectReference> }) => Promise<void>, completeText: HostCompleteText | null = null) {
  const home = await mkdtemp(join(tmpdir(), "pages-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: PAGES_ACTION_PERMISSIONS };
  const client = host.actionClient(ref);
  try {
    await initializeBoard(host, ref, { actor_id: "owner", idempotency_key: "init" });
    await run({ home, host, caller, client, ref, bound: bindActionClient(client, () => caller) });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
}

export const selection = (over: Record<string, unknown>, request_id = "req-1") => ({ request_id, fragment: {
  object: { kind: "pages_document", id: "doc-1", version: 3, title: "留存计划" }, granularity: "range",
  targets: [{ kind: "text_range", role: "paragraph", text: "接口先不改，只加一层适配。" }], ...over } }) as never;
