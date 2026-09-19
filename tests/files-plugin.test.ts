import assert from "node:assert/strict";
import test from "node:test";

import {
  CODING_FILE_CHANGED_EVENT,
  FilePathError,
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

test("路径片段里的 .. 与分隔符被拒绝，而不是被改写", () => {
  for (const path of [[".."], ["a", ".."], ["a/b"], ["a\\b"], ["."], [""]]) {
    assert.throws(() => parseFilePath(path), (error: unknown) => error instanceof FilePathError,
      `${JSON.stringify(path)} 不该被接受`);
  }
  assert.deepEqual(parseFilePath(["src", "index.ts"]), ["src", "index.ts"]);
  assert.deepEqual(parseFilePath([], true), [], "根路径在允许时是合法的");
});

test("控制字符一律拒绝，不只是 NUL", () => {
  assert.throws(() => parseFilePath([`a${String.fromCharCode(0)}b`]), FilePathError);
  assert.throws(() => parseFilePath([`a${String.fromCharCode(9)}b`]), FilePathError);
  assert.throws(() => parseFilePath([`a${String.fromCharCode(10)}b`]), FilePathError);
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
