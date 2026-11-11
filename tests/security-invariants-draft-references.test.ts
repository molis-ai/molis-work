import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

// D0225: URLs hand over no source text; authority is bound to the context, never to caller input.
test("D0225 draft references expire, consume once and refuse another actor, project or purpose without consuming", async t => {
  const home = await mkdtemp(join(tmpdir(), "draft-references-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const projects = [await catalog.createProject({ display_name: "One", actor_id: "owner" }), await catalog.createProject({ display_name: "Two", actor_id: "owner" })];
  catalog.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const clients = projects.map(project => host.actionClient(molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path })));
  const caller = (project = 0, actor_id = "alice"): ActionCallContext => ({ actor_id, project_id: projects[project]!.project_id, audience: "user", permissions: ["ui:drafts"] });
  const issue = { capability_id: "contextual.draft_reference.issue", version: 1, provider_id: "system.home" };
  const take = { capability_id: "contextual.draft_reference.take", version: 1, provider_id: "system.home" };
  const text = "Project-only private draft 😀";
  try {
    const draft = await clients[0]!.invoke(caller(), issue, { purpose: "project-guidance", text }) as { reference: string; expires_at: string };
    assert.match(draft.reference, /^[0-9a-f-]{36}$/); assert.equal(draft.reference.includes(text), false);
    const input = { purpose: "project-guidance", reference: draft.reference };
    await assert.rejects(clients[0]!.invoke(caller(0, "bob"), take, input), { code: "contextual.draft_owner" });
    await assert.rejects(clients[1]!.invoke(caller(1), take, input), { code: "contextual.draft_owner" });
    await assert.rejects(clients[0]!.invoke(caller(), take, { ...input, purpose: "another-place" }), { code: "contextual.draft_owner" });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(clients[0]!.invoke({ ...caller(), signal: controller.signal }, take, input));
    assert.deepEqual(await clients[0]!.invoke(caller(), take, input), { text });
    await assert.rejects(clients[0]!.invoke(caller(), take, input), { code: "contextual.draft_missing" });
    const expiring = await clients[0]!.invoke(caller(), issue, { purpose: "project-guidance", text }) as { reference: string; expires_at: string };
    const after = Date.parse(expiring.expires_at) + 1;
    t.mock.method(Date, "now", () => after);
    await assert.rejects(clients[0]!.invoke(caller(), take, { ...input, reference: expiring.reference }), { code: "contextual.draft_missing" });
    for (let i = 0; i < 100; i++) await clients[0]!.invoke(caller(), issue, { purpose: "project-guidance", text });
    await assert.rejects(clients[0]!.invoke(caller(), issue, { purpose: "project-guidance", text }), { code: "contextual.draft_capacity" });
  } finally { t.mock.restoreAll(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
