import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { KnowledgeService } from "@molis-ai/molis-work-service-knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { initializeBoard } from "./goals-board.js";

/**
 * A project with one linked folder on disk, read through the real Host's workspace read action (specs/project-knowledge K0b):
 * source files, a built folder, a dot folder, and a link that points out of the folder at a secret. Project b has no folder.
 */
export async function knowledgeWorkspace(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "knowledge-workspace-"));
  const folder = join(root, "repo"), outside = join(root, "outside");
  await mkdir(join(folder, "src", "lib"), { recursive: true });
  await mkdir(join(folder, "node_modules", "dep"), { recursive: true });
  await mkdir(join(folder, ".github"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(folder, "README.md"), "# 项目\n\n试用说明在 docs 里。\n");
  await writeFile(join(folder, "src", "index.ts"), "export const answer = 42;\n// 内测通行证 MW-0042\n");
  await writeFile(join(folder, "src", "lib", "util.ts"), "export function util() { return \"内测通行证\"; }\n");
  await writeFile(join(folder, "src", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));
  await writeFile(join(folder, "node_modules", "dep", "index.ts"), "// 内测通行证 in a dependency\n");
  await writeFile(join(folder, ".github", "ci.yml"), "name: ci\n");
  await writeFile(join(outside, "secret.txt"), "内测通行证 secret outside the folder\n");
  await symlink(outside, join(folder, "linked"));
  const workspace = { workspace_id: "ws1", canonical_path: await realpath(folder), display_name: "repo", realpath_verified: true };
  const host = new MolisWorkLocalHost({ homeDirectory: join(root, "home"), completeText: null, workspacesFor: async projectId => projectId === "a" ? [workspace] : [] });
  const reference = (projectId: string) => molisWorkHostProjectReference({ databasePath: join(root, `${projectId}.sqlite`), projectId });
  for (const projectId of ["a", "b"]) {
    await initializeBoard(host, reference(projectId), { actor_id: "web-user", idempotency_key: "init" });
  }
  const cards = openKnowledgeCards({ homeDirectory: root });
  t.after(async () => { cards.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  const knowledge = new KnowledgeService({ search: async () => ({ status: "complete", hits: [] }) as never, cards });
  const agent = (permissions = ["workspace:read"], project_id = "a"): ActionCallContext => ({ actor_id: "agent:assistant", project_id, audience: "agent", permissions });
  /** The caller in its own project, through that project's client. */
  const access = (caller: ActionCallContext) => ({ client: host.actionClient(reference(caller.project_id ?? "a")), caller });
  return { knowledge, agent, access, outside };
}
