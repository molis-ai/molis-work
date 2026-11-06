import assert from "node:assert/strict";
import test from "node:test";
import { pagesActions as actions } from "@molis-ai/molis-work-plugin-pages";
import { body, fixture } from "./fixtures/pages-action-host.js";
import type { HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";

for (const mode of ["missing", "failure", "empty", "cancel", "edit", "delete", "success"] as const) {
  test(`Pages AI ${mode} returns real candidates or rejects without writing a placeholder`, async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const prompts: string[] = [];
    const provider: HostCompleteText = async prompt => {
      prompts.push(prompt);
      if (mode === "failure") throw new Error("Fixture model failure");
      if (mode === "empty") return " ";
      if (mode !== "success") { enter(); await released; }
      return "Actual candidate";
    };
    await fixture(async ({ home, bound, client, caller }) => {
      const { document } = await bound.invoke(actions.create, { body: body("Original") });
      const controller = new AbortController();
      const pending = client.invoke({ ...caller, signal: controller.signal }, actions.ai,
        { id: document.id, command: "rewrite", text: "Source selected text", expected_version: document.version });
      if (mode === "success") {
        assert.deepEqual(await pending, { text: "Actual candidate", command: "rewrite", style: undefined });
        assert.match(prompts[0]!, /Source selected text/);
        const translated = await bound.invoke(actions.ai, { id: document.id, command: "translate_new", text: "Original" });
        assert.equal("stub" in translated, false, "the result no longer carries the retired placeholder flag"); assert.equal(translated.text, "Actual candidate");
        assert.equal((await bound.invoke(actions.list, {})).documents.length, 1, "a candidate is returned, not saved as a document");
      } else {
        const rejection = assert.rejects(pending, mode === "missing" ? { code: "actions.connection_required" }
          : mode === "failure" ? { code: "plugin.model_failed", message: "模型请求失败，请重试" } : mode === "empty" ? /模型没有返回文字/
          : mode === "cancel" ? { name: "AbortError" } : mode === "delete" ? { code: "pages.not_found" } : { code: "pages.conflict" });
        if (!["missing", "failure", "empty"].includes(mode)) {
          await entered;
          if (mode === "cancel") controller.abort();
          else {
            const store = openPagesStore(home);
            try {
              if (mode === "edit") store.update(document.id, { body: body("Concurrent edit") }, "a");
              else store.delete(document.id, "a");
            } finally { store.close(); }
          }
          release();
        }
        await rejection;
        assert.equal((await bound.invoke(actions.list, {})).documents.length, mode === "delete" ? 0 : 1);
      }
      if (mode !== "delete") assert.deepEqual((await bound.invoke(actions.get, { id: document.id })).document.body, body(mode === "edit" ? "Concurrent edit" : "Original"));
    }, mode === "missing" ? null : provider);
  });
}
