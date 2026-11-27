import assert from "node:assert/strict";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { renderAgentReviewDocument } from "@molis-ai/molis-work-app-workbench";
import { authorizeMcpActions, prepareMcpActionReview } from "../../apps/local-host/dist/mcp-action-client.js";
import { createMcpActionGrant } from "../../apps/local-host/dist/mcp-action-grants.js";
import { writeMcpActionGrant } from "../../apps/local-host/dist/mcp-settings-store.js";
import type { openTestHome } from "./test-home.js";
import { response, until } from "./prologue-reviewed-tool.js";

/** Script only the model reply. The public directory, agent tool, decision queue and signed installation own their normal side effects. */
export async function exerciseReview(t: TestContext, served: Awaited<ReturnType<typeof openTestHome>>, project: LocalHostProjectReference, view: ActionView, input: { word: string }) {
  const { host: local, home } = served, pack = view.action.agent_scenario;
  assert.ok(pack?.review);
  const caller = { actor_id: "agent:prologue", actor_kind: "runtime" as const, audience: "agent" as const, project_id: project.project_id, permissions: [] };
  const grant = createMcpActionGrant(caller.actor_id, project.project_id, view, true);
  const selected = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  const owner = { project_id: project.project_id, plugin_id: "sample-review-consumer", install_id: "sample-review-consumer-instance", actor_id: "person" };
  const endpoint = "https://1.1.1.1/v1/messages", originalFetch = globalThis.fetch;
  let turn = 0;
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(url instanceof Request ? url.url : url).origin !== new URL(endpoint).origin) return originalFetch(url, init);
    const body = typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as Uint8Array);
    if (turn++ === 0) return response("find-capabilities", { query: "Notebook editing" });
    if (turn === 2) {
      assert.ok(body.includes(pack.title) && body.includes(pack.instructions), "the ordinary business gateway returned the signed scenario and its rule");
      return response("change-capability", { ...selected, input });
    }
    return response();
  });
  const queue = new AgentReviewQueue(), agent = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "molis.review.signed-tool", appVersion: "1.0.0" }, storageRoot: join(home, "review-runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint, model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  agent.register(adapter);
  try {
    await writeMcpActionGrant(home, grant, { host_reason: "signed sample acceptance" });
    const session = await adapter.createSession({ ...owner, workspace: "business", role_id: "writer", title: "Notebook editing" });
    const authority: AgentStartAuthority = { authorizedDirectories: [home],
      manifest: { roles: [{ role_id: "writer", version: 1, name: "Writer", workspace: "business", execution: "operate", prompts: ["base"], host_tools: [] }], prompts: [{ prompt_id: "base", version: 1 }] },
      prompts: [{ prompt_id: "base", version: 1, layer: "base", body: "Use the selected tool to save the draft." }],
      actions: async () => ({
        discover: async () => { const auth = await authorizeMcpActions(local, caller, home, project); return auth.service.discover(auth.context); },
        prepareReview: (action, proposal) => prepareMcpActionReview(local, caller, home, action, proposal, project, () => {}, () => {}),
        invoke: async (ref, value, signal, control) => {
          const auth = await authorizeMcpActions(local, { ...caller, signal }, home, project);
          return auth.service.invoke({ ...auth.context, assert_authority_current: (...args) => { auth.context.assert_authority_current?.(...args); control?.assert_current(); } }, ref, value);
        },
      }),
    };
    const run = await agent.start("prologue", { ...owner, session, workspace: "business", task: "Save the reviewed wording", role_id: "writer", action_gateway: true }, authority);
    const request = await until(async () => { const pending = queue.list(project.project_id, "pending").find(item => item.run?.run_id === run.ref.run_id);
      const state = await adapter.read(run.ref);
      if (!pending && ["failed", "completed", "cancelled"].includes(state.phase)) throw new Error(JSON.stringify(state));
      return pending; });
    assert.ok(request.document.kind === "tool-operation");
    assert.equal(request.document.plugin_review?.kind, pack.review.kind);
    const html = renderAgentReviewDocument(request.document, { escape: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"), icon: () => "" });
    assert.ok(html.includes('data-plugin-review-kind="' + pack.review.kind + '"') && html.includes("Accept the proposed wording") && html.includes("Proposed wording") && html.includes(input.word));
    assert.ok(html.includes(view.provider.provider_id));
    await queue.respond({ review_id: request.review_id, version: request.reference.version, actor_id: owner.actor_id, decision: "approve" });
    await until(async () => (await adapter.read(run.ref)).phase === "completed" ? true : undefined);
  } finally { fetchMock.mock.restore(); await adapter.close(); queue.close(); }
}
