import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, runWithLocale, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { writerIntegrationCapabilities, type CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import { compareRunChangeSet, DIFF_LABELS } from "@molis-ai/molis-work-plugin-diff";
import { renderDiff, unifiedPatch } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { escapeHtml, icon } from "@molis-ai/molis-work-design-system";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { fakeWriterActions, pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import { diffPageText } from "./fixtures/diff-page-text.js";

// specs/repository-anti-corruption PG-062 (C7, plugin half), slice 3: Coding draws its change reader and a child's integration
// preview itself, with the plugin SDK's `/diff-view`; the server here runs no Coding route hooks, so nothing else could have.
const CODING = "io.molis.work.coding", HAN = /[一-鿿]/u;
/** What the Host drew with before: the page's translator as Diff's renderer used it, the design system's escape and icons. */
const pagePrimitives = (locale: ActionLocale) => ({ escape: (value: unknown) => escapeHtml(String(value)), text: diffPageText(locale), icon: (name: string) => icon(name as Parameters<typeof icon>[0]) });

type ChangeBody = { change: CodingChangeSet; reference: { version: number } | null; html: string; patch: string; view_mode: string; net_groups: unknown[] };
type IntegrationBody = { files: Array<{ path: string[]; before_text?: string | null; after_text?: string | null; diff_html?: string }> };

/** The reader's markup as the Host drew it after the route answered: one write, or the net change across the round. */
function hostReader(body: ChangeBody, query: URLSearchParams, locale: ActionLocale) {
  const change = body.change, index = Number(query.get("change_index") ?? 0), chosen = change.files[index];
  const view = compareRunChangeSet({ content: change, source_plugin_id: CODING, content_version: body.reference?.version ?? 1 }, undefined, index);
  return { html: renderDiff({ labels: DIFF_LABELS, view: { ...view, mode: query.get("layout") === "split" ? "split" : "unified" }, line_feedback: Boolean(body.reference), fold_context: 3, sides: false,
    primitives: pagePrimitives(locale) }),
    patch: chosen && view.phase === "ready" ? unifiedPatch(view.rows, { path: chosen.path, created: chosen.kind === "added", removed: chosen.kind === "deleted" }) : "" };
}

/** A child's file as the Host drew it: a one-file change set of the reviewed text. */
function hostIntegration(file: IntegrationBody["files"][number], locale: ActionLocale) {
  const view = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "integration", applied: false, coverage: "text-reviews", files: [{ path: file.path.join("/"),
    kind: file.before_text === null ? "added" : file.after_text === null ? "deleted" : "modified", added_lines: 0, removed_lines: 0, diff: "",
    review: { review_id: "integration", before_text: file.before_text!, after_text: file.after_text ?? "", decision: "approved", execution: "applied" } }] } as never,
    source_plugin_id: CODING, content_version: 1 }, undefined, 0);
  return renderDiff({ labels: DIFF_LABELS, view, fold_context: 3, sides: false, primitives: pagePrimitives(locale) });
}

test("PG062-09: Coding's change reader and integration preview draw their own markup and patch, as the Host drew them, in the page's language", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-change-html-")), path = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "app", runtime_id: "prologue", at: "2026-10-23T00:00:00Z" });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "app", "sdk", "2026-10-23T00:00:00Z");
  const ref = { session_id: "sdk", run_id: "r" };
  // Two approved writes of one file, the second with markup in it, so both a write and the net change can be read.
  const writes = [["old\n", "new\r\n"], ["new\r\n", "latest <script>\n"]] as const;
  const rows = writes.map(([before_text, after_text], n) => ({ request: { review_id: `review-${n}`, project_id: DEMO_PROJECT_ID, plugin_id: CODING, run: ref, kind: "text-edit",
    document: { kind: "text-edit", target_path: "cart.mjs", exists: true, before_text, after_text } },
    receipt: { review_id: `review-${n}`, status: "approved", effect_settled: true, effect_error: null } }));
  const files = [{ path: ["src", "a.ts"], target: "modified", selectable: true, revision: "1", before_text: "keep\nold <b>\n", after_text: "keep\nnew <b>\n" },
    { path: ["new.ts"], target: "added", selectable: true, revision: "2", before_text: null, after_text: "made\n" },
    { path: ["gone.ts"], target: "deleted", selectable: true, revision: "3", before_text: "was\n", after_text: null },
    { path: ["image.png"], target: "modified", selectable: false, reason: "binary" }];
  const actions = fakeWriterActions(pluginActions(store, DEMO_PROJECT_ID), definition => {
    if (definition.capability_id !== writerIntegrationCapabilities.read.capability_id) throw new Error(`Unexpected action ${definition.capability_id}`);
    return { workspace_id: "work", writer_workspace_id: "child", source_path: `${root}-child`, target_path: root, branch: "writer/child", base_commit: "abc123", files: structuredClone(files) };
  });
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions, actorId: "web-user", escapeHtml: String, translate: (value: string) => value,
    capabilities: { async invoke<I, O>(definition: { capability_id: string }, args: I): Promise<O> {
      const id = definition.capability_id;
      if (id === agent.readSession.capability_id) return { runs: [ref] } as O;
      if (id === agent.readRun.capability_id) return { ref, phase: "completed" } as O;
      if (id === agent.readRunReviews.capability_id) return structuredClone(rows) as O;
      if (id === agent.listRuntimes.capability_id) return [{ runtime_id: "prologue", display_name: "prologue",
        capabilities: { "session.create": "supported", "run.start": "supported", subagents: "partial" } }] as O;
      throw new Error(`Unexpected capability ${id} ${JSON.stringify(args)}`);
    } } });
  // No Coding route hooks: whatever markup the page gets, Coding drew.
  const server = createServer((request, response) => {
    const locale = request.headers["x-page-locale"] === "en" ? "en" : "zh";
    void runWithLocale(locale, () => handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host()))).catch(error => {
      response.writeHead(500); response.end(String(error));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const read = async <Body>(suffix: string, locale: ActionLocale, method = "GET"): Promise<Body> => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/${CODING}/sessions/app${suffix}`, { method, headers: { "x-page-locale": locale } });
    const body = await response.json() as Body;
    assert.equal(response.status, 200, `${suffix}: ${JSON.stringify(body)}`);
    return body;
  };
  try {
    const changeset = "/runs/r/changeset";
    await read(changeset, "zh", "POST");
    for (const locale of ["zh", "en"] as const) {
      for (const query of ["change_index=0", "change_index=1", "change_index=1&layout=split", "change_index=1&layout=columns", "change_index=9", "change_index=-1"]) {
        const body = await read<ChangeBody>(`${changeset}?${query}`, locale), drawn = hostReader(body, new URLSearchParams(query), locale);
        assert.equal(body.html, drawn.html, `${query} draws what the Host drew (${locale})`);
        assert.equal(body.patch, drawn.patch, `${query} copies the patch the Host wrote (${locale})`);
        assert.equal(body.view_mode, "write");
        if (locale === "en") assert.doesNotMatch(body.html.replace(/<[^>]*>/g, ""), HAN, `${query}: the English page gets English words`);
      }
      const write = await read<ChangeBody>(`${changeset}?change_index=1`, locale);
      assert.match(write.html, /latest &lt;script&gt;/); assert.doesNotMatch(write.html, /latest <script>/, "a line's text is escaped");
      assert.match(write.html, /data-coding-line-side="before"/, "a saved change takes line feedback");
      assert.equal(write.patch, "--- a/cart.mjs\n+++ b/cart.mjs\n@@ -1 +1 @@\n-new\r\n+latest <script>\n");
      // The net change across both writes: offered, then drawn from the first write's before to the last write's after.
      assert.deepEqual(write.net_groups, [{ path: "cart.mjs", indices: [0, 1], available: true }]);
      const net = await read<ChangeBody>(`${changeset}?change_index=1&net=1`, locale);
      assert.equal(net.view_mode, "net");
      const merged = { ...net.change, files: [{ ...net.change.files[1]!, kind: net.change.files[0]!.kind, review: { ...net.change.files[1]!.review!, before_text: "old\n" } }] };
      assert.equal(net.html, hostReader({ ...net, change: merged }, new URLSearchParams("change_index=0"), locale).html, `the net change is drawn as the Host drew it (${locale})`);
      assert.equal(net.patch, "--- a/cart.mjs\n+++ b/cart.mjs\n@@ -1 +1 @@\n-old\n+latest <script>\n");
      // A child's results: each text file read as a diff against the main workspace, a file without both texts left alone.
      const integration = await read<IntegrationBody>("/runs/r/subagents/c1/integration", locale);
      assert.equal(integration.files.length, files.length);
      for (const file of integration.files) {
        if (file.before_text === undefined) { assert.equal(file.diff_html, undefined, file.path.join("/")); continue; }
        assert.equal(file.diff_html, hostIntegration(file, locale), `${file.path.join("/")} is drawn as the Host drew it (${locale})`);
        if (locale === "en") assert.doesNotMatch(file.diff_html!.replace(/<[^>]*>/g, ""), HAN);
      }
      assert.match(integration.files[0]!.diff_html!, /new &lt;b&gt;/);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true });
  }
});

test("PG062-09: the Host no longer draws Coding's change reader or integration preview", () => {
  // coding-surface.ts is gone (PG-036 C9); what took over its stage and route work must not use these names either.
  const surface = ["project-plugin-stages.ts", "project-plugin-input-refresh.ts"].map(file => readFileSync(new URL(`../apps/local-host/src/${file}`, import.meta.url), "utf8")).join("\n");
  for (const name of ["renderDiff", "compareRunChangeSet", "unifiedPatch", "codingNetChange", "/integration"]) {
    assert.equal(surface.includes(name), false, `the Host's stage and route code no longer uses ${name}`);
  }
});
