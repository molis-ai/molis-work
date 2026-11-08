import { defineSubjectContextAction, subjectContext, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { COMPOSER_PICK_INPUT_SCHEMA, COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_SCHEMA, COMPOSER_PICK_OUTPUT_TYPE, type ComposerMaterial, type ComposerPickInput, type ComposerPickOutput } from "@molis-ai/molis-work-contracts/platform/composer";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";

/**
 * The unified input's two test plugins (specs/unified-input-voice/implementation-plan.md §5 K2 row), both ordinary project plugins:
 * - a source: `composerSourcePlugin` registers one `composer_source` (its notes, by title) with the reader its kind needs, and
 *   keeps every input it was called with, so a test sees exactly what a source learns. `off()` makes it unavailable as a plugin
 *   turned off would be; `reading(false)` makes its reader refuse a note, as a note deleted since it was picked.
 * - a mount: `composerMountPlugin` is a page that mounts the composer with scene controls and its own submit adapter (`submit`, an
 *   action of its own that checks every picked note with the source's reader and refuses the send when one cannot be read).
 *   `mountScript` is the page's browser code, run in the Workbench document the way a plugin's client pack runs.
 */

const manifest = (id: string, name: string, actions: ActionDefinition[], routes: PluginManifest["routes"] = [], consumes: string[] = []): PluginManifest => ({
  schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name, kind: "app",
  publisher: { publisher_id: "example", signature: `composer-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [], capabilities: { provides: [], consumes }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions, ...(routes?.length ? { routes } : {}),
});

export const NOTE_KIND = "composernotes.note";

export function composerSourcePlugin() {
  const id = "io.molis.work.example.composernotes";
  const reader = defineSubjectContextAction("composernotes.read", 1, NOTE_KIND, "测试笔记", []);
  const pick: ActionDefinition<ComposerPickInput, ComposerPickOutput> = { capability_id: "composernotes.pick", version: 1, operation: "query",
    action: { title: "选测试笔记", description: "按标题找这个项目的测试笔记", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [NOTE_KIND],
      input_type: COMPOSER_PICK_INPUT_TYPE, output_type: COMPOSER_PICK_OUTPUT_TYPE, input_schema: COMPOSER_PICK_INPUT_SCHEMA, output_schema: COMPOSER_PICK_OUTPUT_SCHEMA,
      composer_source: { title: "测试笔记", layers: ["ai", "plain"] } } };
  const notes = [{ id: "n1", title: "访谈记录" }, { id: "n2", title: "访谈提纲" }, { id: "n3", title: "周报" }];
  const seen: unknown[] = [];
  let available = true, readable = true;
  const availability = (): ActionAvailability => available ? { available: true } : { available: false, code: "composernotes.off", reason: "测试笔记已停用" };
  const definition: PluginDefinition = { manifest: manifest(id, "composernotes", [pick, reader]), async start() {
    return { kind: "app", actions: [
      { ...pick, availability, handle: (_caller, input) => {
        seen.push(structuredClone(input));
        const { query, limit } = input as ComposerPickInput;
        return { items: notes.filter((note) => note.title.includes(query)).slice(0, limit)
          .map((note) => ({ ref: { subject: { kind: NOTE_KIND, id: note.id }, pin: { mode: "current" as const, read_revision: "r1" } }, title: note.title, hint: "测试笔记" })) };
      } },
      { ...reader, availability, handle: (_caller, input) => {
        const { subject_id } = input as { subject_id: string };
        const note = notes.find((one) => one.id === subject_id);
        if (!note || !readable) throw Object.assign(new Error("这条笔记已经不在了"), { code: "composernotes.not_found" });
        return subjectContext({ subject: { kind: NOTE_KIND, id: note.id }, title: note.title, revision: "r1", content: note.title });
      } },
    ] };
  } };
  return { id, definition, pick, reader, seen, off: () => { available = false; }, on: () => { available = true; }, reading: (can: boolean) => { readable = can; } };
}

export interface MountSubmission { text: string; materials: ComposerMaterial[]; controls: Record<string, string>; request_id: string; delivery?: string }

export function composerMountPlugin(reader: ActionDefinition) {
  const id = "io.molis.work.example.composermount";
  const sent: MountSubmission[] = [];
  const submit: ActionDefinition<MountSubmission, { state: "sent" } | { state: "failed"; message: string; unreadable: { index: number; reason: string }[] }> = {
    capability_id: "composermount.submit", version: 1, operation: "command",
    action: { title: "发出评论", description: "发出输入框里的评论与选中的资料", kind: "operation", effect: "write", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
      required_actions: [{ capability_id: reader.capability_id, version: reader.version }],
      input_schema: { type: "object", additionalProperties: true, required: ["text", "materials", "controls", "request_id"], properties: {
        text: { type: "string" }, materials: { type: "array" }, controls: { type: "object" }, request_id: { type: "string" }, delivery: { type: "string" } } } },
  };
  const definition: PluginDefinition = { manifest: manifest(id, "composermount", [submit], [{ route_id: "submit", method: "POST", path: "/submit" }], [reader.capability_id]),
    async start(context) {
      return { kind: "app", actions: [{ ...submit, async handle(caller, input) {
        const submission = input as MountSubmission;
        // The picked references are read again now, by their owner's reader (§4 item 4): one that cannot be read stops the send.
        const unreadable: { index: number; reason: string }[] = [];
        for (const [index, material] of submission.materials.entries()) {
          if (material.kind !== "material") continue;
          try { await context.services!.actions!.invokeQuery(reader, { subject_id: material.ref.subject.id }); }
          catch (error) { unreadable.push({ index, reason: error instanceof Error ? error.message : String(error) }); }
        }
        if (unreadable.length) return { state: "failed" as const, message: "有资料读不到", unreadable };
        await caller.beforeEffect();
        sent.push(submission);
        return { state: "sent" as const };
      } }], routes: [bindPluginActionRoute(context, submit, (request) => request.body as MountSubmission, "submit")] };
    } };
  return { id, definition, submit, sent };
}

/**
 * The mount plugin's page code: a plain composer with two scene controls (a select and a toggle) and the plugin's own submit adapter,
 * which posts to its route and hands back what the action answered. Platform drafts per conversation; `/` has one command.
 */
export const mountScript = (pluginId: string, labels: unknown) => `(() => {
  // The page as a plugin draws it: its own area over the Workbench, the composer at the bottom where a conversation keeps it.
  let stage = document.getElementById("composer-stage");
  if (!stage) { stage = document.createElement("main"); stage.id = "composer-stage"; stage.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:grid;align-content:end;justify-items:center;padding:24px 16px;background:var(--page);overflow:auto"; stage.dataset.pluginOwner = "${pluginId}"; document.body.append(stage); }
  const root = document.getElementById("composer-probe") || stage.appendChild(Object.assign(document.createElement("div"), { id: "composer-probe" })); root.style.cssText = "width:min(640px,100%)";
  globalThis.composerCommands = [];
  globalThis.composerHandle = window.molisComposer(root, {
    kind: "plain", labels: ${JSON.stringify(labels)}, entry: "comment", draft: { conversation: "c1" },
    controls: [{ kind: "select", id: "tone", label: "语气", value: "plain", options: [{ value: "plain", label: "平实" }, { value: "warm", label: "亲切" }] },
      { kind: "toggle", id: "notify", label: "通知作者", on: false }],
    commands: [{ slash: "sum", label: "总结", hint: "把讨论总结一句", run: () => globalThis.composerCommands.push("sum") }],
    sources: true,
    near: () => globalThis.composerNear || null,
    attachments: { upload: async (file) => file.name.endsWith(".exe") ? { state: "failed", reason: "这里不收可执行文件" } : { state: "attached", ref: "upload:" + file.name, title: file.name } },
    submit: async (input, signal) => {
      if (globalThis.composerHold) await globalThis.composerHold;
      const answer = await molisWorkRequest((document.body.dataset.routePrefix || "") + "/api/plugins/${pluginId}/submit", { body: input, signal });
      return answer;
    },
  });
})()`;
