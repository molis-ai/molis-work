import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { HOST_EVENT_SOURCE, HOST_WORKSPACE_CHANGED_EVENT, type HostWorkspaceChangedPayload, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginEventDeliveryContext, PluginEventRecord } from "@molis-ai/molis-work-contracts/platform/plugin-events";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createFilesPlugin,
  filesActions,
  CODING_FILE_CHANGED_EVENT,
  GIT_FILE_CHANGED_EVENT,
  entryAt,
  filesManifest,
  parseFilePath,
  parseFileSnapshot,
  parseFileTextSelection,
  parseFilesCollection,
  parseReadingPosition,
  pathKey,
  positionApplies,
  previewFrom,
  previewMessage,
  projectFileTree,
  pruneExpanded,
  serializeReadingPosition,
  toggleExpanded,
  type DirectoryListing,
  type FileTreeInput,
} from "@molis-ai/molis-work-plugin-files";
import { CODING_FILE_CHANGED_EVENT as CODING_EVENT_FROM_CODING } from "@molis-ai/molis-work-plugin-coding";
import { GIT_FILE_CHANGED_EVENT as GIT_EVENT_FROM_GIT } from "@molis-ai/molis-work-plugin-git";

function listing(names: Array<[string, "file" | "directory"]>, prefix: string[] = []): DirectoryListing {
  return {
    entries: names.map(([name, kind]) => ({ name, kind, path: [...prefix, name] })),
    truncated: false,
  };
}

// WSERR-01: the shared parser rejects these actual unsafe paths.
test("路径片段里的 .. 与分隔符被拒绝，而不是被改写", () => {
  for (const path of [[".."], ["a", ".."], ["a/b"], ["a\\b"], ["."], [""]]) {
    assert.throws(() => parseFilePath(path), (error: unknown) => error instanceof ActionError && error.code === "work.workspace.invalid_path" && actionHttpStatus(error) === 400,
      `${JSON.stringify(path)} 不该被接受`);
  }
  assert.deepEqual(parseFilePath(["src", "index.ts"]), ["src", "index.ts"]);
  assert.deepEqual(parseFilePath([], true), [], "根路径在允许时是合法的");
});

test("控制字符一律拒绝，不只是 NUL", () => {
  assert.throws(() => parseFilePath([`a${String.fromCharCode(0)}b`]), (error: unknown) => error instanceof ActionError && error.code === "work.workspace.invalid_path" && actionHttpStatus(error) === 400);
  assert.throws(() => parseFilePath([`a${String.fromCharCode(9)}b`]), (error: unknown) => error instanceof ActionError && error.code === "work.workspace.invalid_path" && actionHttpStatus(error) === 400);
  assert.throws(() => parseFilePath([`a${String.fromCharCode(10)}b`]), (error: unknown) => error instanceof ActionError && error.code === "work.workspace.invalid_path" && actionHttpStatus(error) === 400);
});

test("两条不同的路径不会算出同一个 key", () => {
  assert.notEqual(pathKey(["a", "b"]), pathKey(["a/b"]));
  assert.equal(pathKey(["a", "b"]), pathKey(["a", "b"]));
});

test("展开了但目录还没读回来时说“读取中”，不说“空的”", () => {
  const input: FileTreeInput = {
    root: listing([["src", "directory"]]),
    children: new Map(),
    expanded: new Set([pathKey(["src"])]),
  };
  const [node] = projectFileTree(input);
  assert.equal(node?.expanded, true);
  assert.equal(node?.loading, true);
  assert.equal(node?.children, undefined, "没读回来就没有 children，和空目录不是一回事");

  const withEmpty: FileTreeInput = {
    ...input,
    children: new Map([[pathKey(["src"]), { entries: [], truncated: false }]]),
  };
  const [loaded] = projectFileTree(withEmpty);
  assert.equal(loaded?.loading, false);
  assert.deepEqual(loaded?.children, [], "读回来是空的，才是空目录");
});

test("列不动的目录带着原因渲染", () => {
  const nodes = projectFileTree({
    root: listing([["secret", "directory"]]),
    children: new Map([[pathKey(["secret"]), { entries: [], truncated: false, error: "没有权限" }]]),
    expanded: new Set([pathKey(["secret"])]),
  });
  assert.equal(nodes[0]?.error, "没有权限");
  assert.equal(nodes[0]?.children, undefined, "出错的目录不假装列出了内容");
});

test("折叠保留子目录的展开状态，刷新掉了的目录才被清掉", () => {
  const first = toggleExpanded(new Set(), ["src"]);
  assert.equal(first.has(pathKey(["src"])), true);
  const withChild = toggleExpanded(first, ["src", "web"]);
  const collapsed = toggleExpanded(withChild, ["src"]);
  assert.equal(collapsed.has(pathKey(["src"])), false);
  assert.equal(collapsed.has(pathKey(["src", "web"])), true, "重新展开不该把里面全关上");

  const pruned = pruneExpanded(withChild, new Set([pathKey(["src"])]));
  assert.deepEqual([...pruned], [pathKey(["src"])], "目录没了，它的展开也该没");
});

test("entryAt 只走已经读回来的层级", () => {
  const input: FileTreeInput = {
    root: listing([["src", "directory"]]),
    children: new Map([[pathKey(["src"]), listing([["index.ts", "file"]], ["src"])]]),
    expanded: new Set([pathKey(["src"])]),
  };
  assert.equal(entryAt(input, ["src", "index.ts"])?.name, "index.ts");
  assert.equal(entryAt(input, ["src", "missing.ts"]), undefined);
  assert.equal(entryAt(input, ["src", "index.ts", "deeper"]), undefined, "文件下面没有东西");
});

test("读不了的每种原因各有各的说法", () => {
  const path = ["a.bin"];
  const messages = new Set([
    previewMessage(previewFrom({ outcome: "binary" }, path)),
    previewMessage(previewFrom({ outcome: "denied" }, path)),
    previewMessage(previewFrom({ outcome: "missing" }, path)),
    previewMessage(previewFrom({ outcome: "too-large", bytes: 9, limit: 8 }, path)),
    previewMessage(previewFrom({ outcome: "unsupported" }, path)),
  ]);
  assert.equal(messages.size, 5, "五种麻烦不该说同一句话");
  assert.equal(previewFrom({ outcome: "text", text: "" }, path).status, "empty",
    "零长度才是空文件");
  assert.equal(previewFrom({ outcome: "text", text: " " }, path).status, "text",
    "只有空格的文件仍然是文本");
});

test("坏掉的阅读位置被丢弃，而不是抛出来挡住 Files", () => {
  assert.equal(parseReadingPosition("not json"), undefined);
  assert.equal(parseReadingPosition(JSON.stringify({ workspace_id: "ws", path: [".."] })), undefined);
  assert.equal(parseReadingPosition(null), undefined);
  const round = serializeReadingPosition({ workspace_id: "ws-1", path: ["a", "b.ts"] });
  assert.deepEqual(parseReadingPosition(round), { workspace_id: "ws-1", path: ["a", "b.ts"] });
});

test("别的工作目录的阅读位置不会被恢复", () => {
  const position = { workspace_id: "ws-1", path: ["a.ts"] };
  assert.equal(positionApplies(position, "ws-1"), true);
  assert.equal(positionApplies(position, "ws-2"), false);
  assert.equal(positionApplies(position, null), false);
});

test("快照与选区在边界上验：范围必须和捕获的文本对得上", () => {
  const snapshot = {
    workspace: { workspace_id: "ws-1", name: "项目" },
    path: ["a.ts"],
    text: "hello",
  };
  assert.equal(parseFileSnapshot(snapshot).text, "hello");
  assert.equal(parseFileTextSelection({ ...snapshot, start: 0, end: 5 }).end, 5);
  assert.throws(() => parseFileTextSelection({ ...snapshot, start: 0, end: 4 }), /长度不一致/);
  assert.throws(() => parseFileTextSelection({ ...snapshot, start: 3, end: 3 }), /非空文本/);
});

test("文件集合的身份必须和句柄一致", () => {
  const base = {
    workspace: { workspace_id: "ws-1", name: "项目" },
    collection: { handle: "ws-1", display_name: "项目", entry_count: 2, truncated: false },
    selection: null,
  };
  assert.equal(parseFilesCollection(base).collection.entry_count, 2);
  assert.throws(
    () => parseFilesCollection({ ...base, collection: { ...base.collection, handle: "ws-2" } }),
    /身份与句柄不一致/,
  );
});

test("Files 订阅的事件 id 和发布方导出的是同一个", () => {
  assert.equal(CODING_FILE_CHANGED_EVENT, CODING_EVENT_FROM_CODING);
  assert.equal(GIT_FILE_CHANGED_EVENT, GIT_EVENT_FROM_GIT);
  const subscribed = (filesManifest.events?.subscribes ?? []).map((entry) => entry.event_type_id);
  assert.equal(subscribed.includes(GIT_FILE_CHANGED_EVENT), true);
  assert.equal(subscribed.includes(CODING_FILE_CHANGED_EVENT), true);
});

test("PG061-FILES-01 a Coding or Git event makes Files' own pages read again; a delivery no longer current moves nothing, and nothing else calls it", async () => {
  // C6: the Host's `onWorkspaceChanged` port is gone; Files moves its own revision through `services.ui.invalidate()` (PG-061).
  let invalidated = 0;
  const context: PluginStartContext = { install_id: "files-invalidate", installation_generation: "1", plugin_id: filesManifest.plugin_id, version: filesManifest.version,
    deployment: "local", grants: filesManifest.permissions.map(item => item.permission), project_id: "project", actor_id: "web-user",
    requireGrant: () => {}, services: { ui: { register: () => {}, unregister: () => {}, invalidate: () => { invalidated++; } } } };
  const plugin = createFilesPlugin({ readable: () => true }), contribution = await plugin.start(context);
  const record: PluginEventRecord = { event_id: "event-1", project_id: "project", sequence: 1, event_type_id: GIT_FILE_CHANGED_EVENT, type_version: 1,
    source_plugin_id: "io.molis.work.git", source_install_id: "git", payload: {}, correlation_id: null, occurred_at: new Date(0).toISOString() };
  const delivery = (beforeEffect: () => void): PluginEventDeliveryContext => ({ project_id: "project", plugin_id: filesManifest.plugin_id,
    install_id: context.install_id, installation_generation: "1", actor_id: `plugin:${filesManifest.plugin_id}`, signal: new AbortController().signal, beforeEffect });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(invalidated, 0, "starting and idling move nothing: Files keeps no timer or watcher that calls it (BL-411)");

  await contribution.onEvent!(record, delivery(() => {}));
  assert.equal(invalidated, 1, "the delivery makes Files' own pages read again");

  const refusal = new Error("the subscriber's installation is no longer current");
  await assert.rejects(async () => contribution.onEvent!(record, delivery(() => { throw refusal; })), error => error === refusal);
  assert.equal(invalidated, 1, "a delivery that is no longer current is refused before it moves anything");

  await plugin.stop!(context);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(invalidated, 1, "after stop nothing is left to call it");
});


test("S18-FILES-RETRY a refused workspace transition retries persistence and every output before remembering success", async () => {
  for (const failure of ["save", "delete", "invalidate"] as const) {
    const service = new ActionService(), stored = new Map([["last-workspace", "old"]]), invalidated: string[] = [];
    const selected = failure === "delete" ? null : { workspace_id: "next", display_name: "Next" };
    const caller = { actor_id: "owner", project_id: "files-retry", audience: "user" as const, permissions: filesActions.state.action.permissions };
    const actions = bindActionClient(service, () => caller);
    let refuse = true, persistenceCalls = 0;
    const rejected = () => { throw new ActionError("actions.forbidden", "transition was refused"); };
    const context: PluginStartContext = { install_id: "files-retry", installation_generation: "1", plugin_id: filesManifest.plugin_id, version: filesManifest.version,
      deployment: "local", grants: filesManifest.permissions.map(item => item.permission), project_id: caller.project_id, actor_id: caller.actor_id,
      requireGrant: () => {}, services: {
        ui: { register: () => {}, unregister: () => {} },
        actions: { ...actions, invokeQuery: async () => assert.fail("the state action does not delegate queries") },
        capabilities: { availability: () => ({ available: true }), invoke: async <Input, Output>(_capability: unknown, _input: Input) => selected as Output },
        storage: { get: key => stored.get(key) ?? null, set: (key, value) => {
          persistenceCalls++; if (refuse && failure === "save") rejected(); stored.set(key, value);
        }, delete: key => { persistenceCalls++; if (refuse && failure === "delete") rejected(); return stored.delete(key); } },
        outputs: { publish: () => assert.fail("state does not publish"), select: () => assert.fail("state does not select"), reference: () => null,
          retain: () => assert.fail("state does not retain"), read: () => null, invalidate: port => {
            if (refuse && failure === "invalidate" && port === "before") rejected(); invalidated.push(port);
          } },
      } };
    const contribution = await createFilesPlugin().start(context);
    const handler = contribution.actions!.find(item => item.capability_id === filesActions.state.capability_id)!;
    const unregister = service.registerProvider({ provider: { provider_id: context.install_id, plugin_install_id: context.install_id,
      plugin_id: context.plugin_id, title: "Files", kind: "plugin", project_id: caller.project_id }, definitions: [filesActions.state], handlers: [handler] });
    try {
      await assert.rejects(actions.invoke(filesActions.state, {}), { code: "actions.forbidden" }, failure);
      assert.equal(stored.get("last-workspace"), failure === "invalidate" ? "next" : "old", `${failure}: only completed persistence remains`);
      assert.deepEqual(invalidated, failure === "invalidate" ? ["files"] : [], `${failure}: only completed invalidations remain`);
      refuse = false; invalidated.length = 0;
      const retry = () => actions.invoke(filesActions.state, {});
      if (selected) assert.equal((await retry()).workspace.workspace_id, "next");
      else await assert.rejects(retry(), { code: "files.invalid" });
      assert.equal(persistenceCalls, 2, `${failure}: the refused transition is retried`);
      assert.equal(stored.get("last-workspace") ?? null, selected?.workspace_id ?? null);
      assert.deepEqual(invalidated, ["files", "before", "after", "selection"], `${failure}: retry completes all outputs`);
      invalidated.length = 0;
      if (selected) await retry(); else await assert.rejects(retry(), { code: "files.invalid" });
      assert.equal(persistenceCalls, 2, `${failure}: a completed transition is remembered`);
      assert.deepEqual(invalidated, []);
    } finally { unregister(); }
  }
});

test("BL-379 any person-approved workspace operation makes Files' pages read again, whoever asked for it", async () => {
  // Coding's worktree and integration reviews settle only to Coding, and Git publishes `operation-updated` only for its own
  // (S-54). The Host's broadcast reaches Files for every one of them.
  assert.ok(filesManifest.events?.subscribes.some(item => item.event_type_id === HOST_WORKSPACE_CHANGED_EVENT && item.type_version === 1 && item.from_plugin_ids === undefined),
    "Files subscribes to the Host's broadcast by type and version only");
  assert.ok(filesManifest.permissions.some(item => item.permission === "workspace:read" && item.required), "and declares the permission it is broadcast under");
  let invalidated = 0;
  const context: PluginStartContext = { install_id: "files-changed", plugin_id: filesManifest.plugin_id, version: filesManifest.version,
    deployment: "local", grants: filesManifest.permissions.map(item => item.permission), project_id: "project", actor_id: "web-user",
    requireGrant: () => {}, services: { ui: { register: () => {}, unregister: () => {}, invalidate: () => { invalidated++; } } } };
  const plugin = createFilesPlugin({ readable: () => true }), contribution = await plugin.start(context);
  const payload: HostWorkspaceChangedPayload = { workspace_id: "ws-1", cause: "plugin-operation" };
  const record: PluginEventRecord = { event_id: "host-changed-1", project_id: "project", sequence: 0, event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1,
    source_plugin_id: HOST_EVENT_SOURCE, source_install_id: HOST_EVENT_SOURCE, payload, correlation_id: null, occurred_at: new Date(0).toISOString() };
  const delivery = (beforeEffect: () => void): PluginEventDeliveryContext => ({ project_id: "project", plugin_id: filesManifest.plugin_id,
    install_id: context.install_id, installation_generation: "1", actor_id: `plugin:${filesManifest.plugin_id}`, signal: new AbortController().signal, beforeEffect });
  await contribution.onEvent!(record, delivery(() => {}));
  assert.equal(invalidated, 1, "Files' pages read again");
  const stale = new Error("the subscriber's installation is no longer current");
  await assert.rejects(async () => contribution.onEvent!(record, delivery(() => { throw stale; })), error => error === stale);
  assert.equal(invalidated, 1, "a delivery no longer current moves nothing");
  await plugin.stop!(context);
});

test("RAC-332 BL-366 a workspace change makes Files look again at the folder it browses: a switch withdraws the old folder's snapshots, a stale delivery withdraws nothing", async () => {
  const stored = new Map([["last-workspace", "old"]]), withdrawn: string[] = [];
  let selected: { workspace_id: string; display_name: string } | null = { workspace_id: "old", display_name: "Old" }, invalidated = 0;
  const context: PluginStartContext = { install_id: "files-recheck", installation_generation: "1", plugin_id: filesManifest.plugin_id, version: filesManifest.version,
    deployment: "local", grants: filesManifest.permissions.map(item => item.permission), project_id: "project", actor_id: "web-user", requireGrant: () => {}, services: {
      ui: { register: () => {}, unregister: () => {}, invalidate: () => { invalidated++; } },
      capabilities: { availability: () => ({ available: true }), invoke: async <Input, Output>(_capability: unknown, _input: Input) => selected as Output },
      storage: { get: key => stored.get(key) ?? null, set: (key, value) => { stored.set(key, value); }, delete: key => stored.delete(key) },
      outputs: { publish: () => assert.fail("no publish"), select: () => assert.fail("no select"), reference: () => null, retain: () => assert.fail("no retain"), read: () => null,
        invalidate: port => { withdrawn.push(port); } },
    } };
  const plugin = createFilesPlugin({ readable: () => true }), contribution = await plugin.start(context);
  const record: PluginEventRecord = { event_id: "host-changed-agent", project_id: "project", sequence: 0, event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1,
    source_plugin_id: HOST_EVENT_SOURCE, source_install_id: HOST_EVENT_SOURCE, payload: { workspace_id: "old", cause: "agent-change" } satisfies HostWorkspaceChangedPayload,
    correlation_id: null, occurred_at: new Date(0).toISOString() };
  const delivery = (beforeEffect: () => void): PluginEventDeliveryContext => ({ project_id: "project", plugin_id: filesManifest.plugin_id,
    install_id: context.install_id, installation_generation: "1", actor_id: `plugin:${filesManifest.plugin_id}`, signal: new AbortController().signal, beforeEffect });

  await contribution.onEvent!(record, delivery(() => {}));
  assert.deepEqual(withdrawn, [], "the same folder: its snapshots stay");
  assert.equal(invalidated, 1);

  // The folder was switched while the delivery was being read: the delivery is refused before anything is withdrawn.
  selected = { workspace_id: "next", display_name: "Next" };
  let checks = 0;
  const stale = new Error("the subscriber's installation is no longer current");
  await assert.rejects(async () => contribution.onEvent!(record, delivery(() => { if (++checks > 1) throw stale; })), error => error === stale);
  assert.deepEqual(withdrawn, [], "a delivery no longer current withdraws nothing");
  assert.equal(stored.get("last-workspace"), "old");
  assert.equal(invalidated, 1);

  await contribution.onEvent!(record, delivery(() => {}));
  assert.deepEqual(withdrawn, ["files", "before", "after", "selection"], "a switch withdraws every snapshot of the old folder");
  assert.equal(stored.get("last-workspace"), "next");
  assert.equal(invalidated, 2);
  withdrawn.length = 0;
  await contribution.onEvent!(record, delivery(() => {}));
  assert.deepEqual(withdrawn, [], "a switch is withdrawn once");
  await plugin.stop!(context);
});
