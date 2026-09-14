# Workbench Frame Container Implementation Plan

> **冻结（2026-09-14）：** 产品模型已改为「Goal 画布为主画布、一 Goal 一 Frame」。所有权：容器是壳，Frame 是按 Goal 的工作面能力（非目录插件），资产只被引用。本计划仍按第一版通用 Frame 书写，**视觉锁定前不要执行**。以 `spec.md` 与 `docs/design/workbench-frame-container/` 为准。
>
> 原文从下一行开始，仅作历史。

# Workbench Frame Container Implementation Plan (v1, superseded)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plugin-owned `workbench.main` stage with a per-project Container of Windows and Tabs (Frame canvases and Item viewports), matching `specs/workbench-frame-container/spec.md`.

**Architecture:** One TypeScript reducer owns Container/Window/Tab/Frame/Block mutations and is used by Host HTTP and tests. The immersive shell renders that document into `#data-plugin-stage`. Plugins keep Item facts and paint Block/viewport slots. Persistence is a JSON file per project beside the catalog data dir, not catalog schema 11 and not Artifacts.

**Tech Stack:** TypeScript, Node.js 24 `node:test`, existing Workbench string-concat client, Local Host HTTP, UI Host slots, native Goals/Work/Feed/Artifacts plugins.

**Spec:** `specs/workbench-frame-container/spec.md`

## Global Constraints

- Completion level 3 (functionally usable). No release, no real-user DB, no new installed App.
- No OS-level extra windows. No canvas conversation/Agent. No Goal→Artifact identity migration. Goals dependency graph stays inside the Goals plugin viewport, not the Frame canvas.
- Do not bump `CATALOG_SCHEMA_VERSION` (currently 11). Do not store Frames as Artifact versions or Goal events.
- Directory, project home, plugin market, settings stay. Empty Container shows existing project home.
- Clicking a directory Item always creates a new Frame Tab. Tear-off clones an Item viewport; Tab drags between Windows move the Tab.
- Closing a Frame Tab keeps the Frame in `frames[]`. Closing the last viewport of a terminal/browser Item must tell Work to dispose that session.
- Workbench client is concatenated factory scripts in `apps/workbench/src/browser-assets.ts`. New browser logic follows that pattern. Reducer logic lives in importable `.ts` so tests do not execute string scripts.
- Do not `git commit` unless the user explicitly asks.
- Copy goes through existing `L()` / i18n catalogs. Chinese default, English via existing en map.
- One writer on shared workbench shell files; plugin UI changes stay in that plugin.

## File map

| File | Responsibility |
| --- | --- |
| `packages/contracts/src/platform/workbench-container.ts` | Types + `parseWorkbenchProjectDocument` |
| `packages/contracts/package.json` | Export `./platform/workbench-container` |
| `apps/workbench/src/container/state.ts` | Pure reducer: every structural command |
| `apps/workbench/src/container/render.ts` | HTML for Container / Window / Tab strip / Frame canvas / empty home |
| `apps/workbench/src/container/styles.ts` | Container, windows, tabs, canvas, float, split |
| `apps/workbench/src/scripts/client/container.ts` | Browser: pointer, persist, mount plugin surfaces |
| `apps/local-host/src/workbench-container-store.ts` | Read/write `{dataDir}/workbench/{project_id}.json` |
| `apps/local-host/src/web-workbench-container.ts` | `GET/PUT /api/workbench/container`, `POST /api/workbench/command` |
| `apps/workbench/src/ui-composition.ts` | Slots `workbench.tab-body`, `workbench.block` |
| `apps/workbench/src/goals-page-renderer.ts` | Put Container into `data-plugin-stage` |
| `apps/workbench/src/browser-assets.ts` | Concatenate container client + styles |
| Plugins Goals/Work/Feed/Artifacts | Block + viewport surfaces; Work: browser/terminal create |

Existing plugin pages under `data-work-surface` remain as **legacy directory destinations** until Tasks 5–7 reroute Item opens into the Container. Do not delete Feed/Artifacts surfaces in Task 4.

---

### Task 1: Contract document

**Files:**
- Create: `packages/contracts/src/platform/workbench-container.ts`
- Modify: `packages/contracts/package.json` (add export `./platform/workbench-container` mirroring `./platform/ui`)
- Test: `tests/workbench-container-contract.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: types and `parseWorkbenchProjectDocument(input: unknown): WorkbenchProjectDocument` throwing `Error` with a Chinese message on invalid input

```ts
export type WorkbenchItemType =
  | "goal"
  | "session"
  | "feed_entry"
  | "artifact"
  | "browser"
  | "terminal";

export interface WorkbenchItemRef {
  readonly plugin_id: string;
  readonly item_type: WorkbenchItemType;
  readonly item_id: string;
}

export interface WorkbenchBlockRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkbenchBlock {
  readonly block_id: string;
  readonly item: WorkbenchItemRef;
  readonly rect: WorkbenchBlockRect;
}

export interface WorkbenchCamera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface WorkbenchFrame {
  readonly frame_id: string;
  readonly title: string;
  readonly camera: WorkbenchCamera;
  readonly blocks: readonly WorkbenchBlock[];
}

export type WorkbenchTab =
  | { readonly tab_id: string; readonly kind: "frame"; readonly frame_id: string }
  | { readonly tab_id: string; readonly kind: "item"; readonly item: WorkbenchItemRef };

export interface WorkbenchWindow {
  readonly window_id: string;
  readonly mode: "tiled" | "float";
  readonly bounds: WorkbenchBlockRect | null;
  readonly tab_ids: readonly string[];
  readonly active_tab_id: string | null;
}

export type WorkbenchTiledLayout =
  | { readonly kind: "leaf"; readonly window_id: string }
  | {
      readonly kind: "split";
      readonly direction: "horizontal" | "vertical";
      readonly ratio: number;
      readonly first: WorkbenchTiledLayout;
      readonly second: WorkbenchTiledLayout;
    };

export interface WorkbenchContainerSession {
  readonly tabs: readonly WorkbenchTab[];
  readonly windows: readonly WorkbenchWindow[];
  readonly tiled_root: WorkbenchTiledLayout | null;
  readonly focused_window_id: string | null;
}

export interface WorkbenchProjectDocument {
  readonly version: 1;
  readonly project_id: string;
  readonly frames: readonly WorkbenchFrame[];
  readonly session: WorkbenchContainerSession;
}
```

- [ ] **Step 1: Write the failing test**

Create `tests/workbench-container-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkbenchProjectDocument } from "@adeptify/goalboard-contracts/platform/workbench-container";

test("parseWorkbenchProjectDocument accepts a valid empty project document", () => {
  const doc = parseWorkbenchProjectDocument({
    version: 1,
    project_id: "proj-1",
    frames: [],
    session: { tabs: [], windows: [], tiled_root: null, focused_window_id: null },
  });
  assert.equal(doc.project_id, "proj-1");
  assert.equal(doc.frames.length, 0);
});

test("parseWorkbenchProjectDocument rejects a tab that points at a missing frame", () => {
  assert.throws(
    () => parseWorkbenchProjectDocument({
      version: 1,
      project_id: "proj-1",
      frames: [],
      session: {
        tabs: [{ tab_id: "t1", kind: "frame", frame_id: "missing" }],
        windows: [{ window_id: "w1", mode: "tiled", bounds: null, tab_ids: ["t1"], active_tab_id: "t1" }],
        tiled_root: { kind: "leaf", window_id: "w1" },
        focused_window_id: "w1",
      },
    }),
    /Frame/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test --test-concurrency=1 tests/workbench-container-contract.test.ts`

Expected: FAIL resolving the export or `parseWorkbenchProjectDocument`.

- [ ] **Step 3: Implement parser**

Validate `version === 1`, non-empty `project_id`, unique ids, every `frame` tab's `frame_id` exists, every window `tab_ids` exist, `active_tab_id` is in that window's `tab_ids` or null, `tiled_root` leaves reference existing tiled windows, float windows are not in `tiled_root`. Reject unknown `item_type`. Do not interpret Goal/Session payloads.

- [ ] **Step 4: Export subpath**

Add `"./platform/workbench-container"` to `packages/contracts/package.json` `exports` exactly like `./platform/ui`.

- [ ] **Step 5: Re-run test**

Run: `pnpm --filter @adeptify/goalboard-contracts build && node --import tsx --test --test-concurrency=1 tests/workbench-container-contract.test.ts`

Expected: PASS.

---

### Task 2: Pure container reducer

**Files:**
- Create: `apps/workbench/src/container/state.ts`
- Test: `tests/workbench-container-state.test.ts`

**Interfaces:**
- Consumes: `WorkbenchProjectDocument` from Task 1
- Produces:

```ts
export type WorkbenchCommand =
  | { readonly type: "open_frame_for_item"; readonly item: WorkbenchItemRef; readonly window_id?: string }
  | { readonly type: "add_block_to_frame"; readonly frame_id: string; readonly item: WorkbenchItemRef; readonly rect: WorkbenchBlockRect }
  | { readonly type: "open_item_tab"; readonly item: WorkbenchItemRef; readonly window_id?: string; readonly reuse_existing: boolean }
  | { readonly type: "clone_item_viewport"; readonly item: WorkbenchItemRef; readonly window_id?: string; readonly float: boolean; readonly bounds?: WorkbenchBlockRect }
  | { readonly type: "move_tab"; readonly tab_id: string; readonly to_window_id: string; readonly index: number }
  | { readonly type: "detach_tab_to_float"; readonly tab_id: string; readonly bounds: WorkbenchBlockRect }
  | { readonly type: "split_window"; readonly window_id: string; readonly direction: "horizontal" | "vertical"; readonly tab_id: string }
  | { readonly type: "close_tab"; readonly tab_id: string }
  | { readonly type: "focus_tab"; readonly tab_id: string }
  | { readonly type: "set_frame_camera"; readonly frame_id: string; readonly camera: WorkbenchCamera }
  | { readonly type: "set_block_rect"; readonly frame_id: string; readonly block_id: string; readonly rect: WorkbenchBlockRect }
  | { readonly type: "reopen_frame"; readonly frame_id: string; readonly window_id?: string }
  | { readonly type: "delete_frame"; readonly frame_id: string };

export interface WorkbenchCommandResult {
  readonly document: WorkbenchProjectDocument;
  readonly disposed_items: readonly WorkbenchItemRef[];
}

export function emptyWorkbenchDocument(projectId: string): WorkbenchProjectDocument;
export function applyWorkbenchCommand(
  document: WorkbenchProjectDocument,
  command: WorkbenchCommand,
  ids: { nextId(): string },
): WorkbenchCommandResult;
```

`disposed_items` is the list of browser/terminal Items whose Item-viewport tab count dropped to zero. Host uses it to ask Work to kill PTY/browser. Goals are never disposed this way.

Rules (must match spec; tests encode them):

- `open_frame_for_item`: always new Frame + new frame Tab in focused window (or create one tiled window). Default block rect `{ x: 80, y: 80, width: 320, height: 220 }`. Title = `item.item_type` + last 6 of `item_id` until UI replaces it.
- `add_block_to_frame`: appends a Block, no Tab.
- `open_item_tab` with `reuse_existing: true`: focus an existing item Tab for that ref; else create. Directory click never uses this.
- `clone_item_viewport`: always new item Tab even if one exists. `float: true` creates a float Window.
- `close_tab` on a frame Tab removes the Tab only. `reopen_frame` adds a frame Tab for an existing Frame without duplicating it. `delete_frame` removes Frame and any Tabs pointing at it.
- Last tab in a Window closes the Window and rewrites `tiled_root`. Last window → empty session (`tiled_root: null`).
- `move_tab` is a move, not a clone.

- [ ] **Step 1: Write failing tests** covering: two directory opens → two Frames; add_block does not add a tab; close frame tab keeps frames[]; clone viewport while block remains; last terminal viewport appears in `disposed_items`; move_tab changes window.tab_ids.

- [ ] **Step 2: Run** `node --import tsx --test --test-concurrency=1 tests/workbench-container-state.test.ts` — Expected: FAIL module missing.

- [ ] **Step 3: Implement `applyWorkbenchCommand` with no DOM, no fetch.**

- [ ] **Step 4: Re-run tests — Expected: PASS.**

---

### Task 3: Host persistence and command HTTP

**Files:**
- Create: `apps/local-host/src/workbench-container-store.ts`
- Create: `apps/local-host/src/web-workbench-container.ts`
- Modify: the Local Host HTTP composer that already registers `web-project-settings` (same file that wires `createLocalProjectSettingsHttp`) so GET/PUT/POST are reachable
- Test: `tests/workbench-container-http.test.ts`

**Interfaces:**
- Consumes: `parseWorkbenchProjectDocument`, `applyWorkbenchCommand`, `emptyWorkbenchDocument`
- Produces:

```
GET  /api/workbench/container?project_id=
PUT  /api/workbench/container
POST /api/workbench/command
```

PUT/POST body: `{ project_id, document? }` or `{ project_id, command }`. Response JSON is the parsed `WorkbenchProjectDocument`. Unknown project_id → 404. Invalid document → 400. Missing file → `emptyWorkbenchDocument(project_id)`.

Store path: `{catalogParent}/workbench/{safeProjectId}.json` where `catalogParent` is `path.dirname(catalog sqlite path)`. Create `workbench/` on first write. Never write into the project git workspace.

Do not call Work/PTY in this task; return `disposed_items` in POST response for Task 7.

- [ ] **Step 1: Failing HTTP test** using the same isolated catalog/temp dir pattern as `tests/project-plugins.test.ts`: PUT a document, GET it back; POST `open_frame_for_item`; GET shows one frame.

- [ ] **Step 2: Run test — Expected: FAIL 404 on `/api/workbench/container`.**

- [ ] **Step 3: Implement store + routes. Wire into existing web request dispatcher next to project-settings routes.**

- [ ] **Step 4: Run `node --import tsx --test --test-concurrency=1 tests/workbench-container-http.test.ts` — Expected: PASS.**

---

### Task 4: Shell chrome, empty home

**Files:**
- Create: `apps/workbench/src/container/render.ts`
- Create: `apps/workbench/src/styles/container.ts`
- Modify: `apps/workbench/src/goals-page-renderer.ts` (wrap `data-plugin-stage` with Container root; keep existing `data-work-surface` children as hidden legacy surfaces)
- Modify: `apps/workbench/src/renderer.ts` to include container CSS in the workbench stylesheet concatenation
- Modify: `apps/workbench/src/ui-composition.ts` add slots:

```ts
tabBody: { slot_id: "workbench.tab-body", version: 1, accepts: ["declarative-html"] },
block: { slot_id: "workbench.block", version: 1, accepts: ["declarative-html"] },
```

- Test: `tests/workbench-container-shell.test.ts` (string render, no browser)

**Interfaces:**
- Consumes: `WorkbenchProjectDocument`
- Produces: `renderWorkbenchContainer(doc, { L, escapeHtml, homeHtml: string }): string`

Empty session: Container root contains `[data-container-home]` with the existing project home markup (pass `homeHtml` from `renderProjectHome`). Non-empty: hide home, show windows.

Markup contract (tests assert these hooks):

```html
<div class="workbench-container" data-workbench-container data-project-id="{id}">
  <div data-container-home>...</div>
  <div data-container-windows>
    <section class="workbench-window" data-window-id data-window-mode="tiled|float">
      <div class="workbench-tabstrip" data-window-tabs>
        <button type="button" data-tab-id data-tab-kind="frame|item"></button>
      </div>
      <div class="workbench-tab-body" data-tab-body>
        <!-- frame: -->
        <div class="workbench-frame-canvas" data-frame-id data-canvas>
          <article data-block-id data-item-type data-item-id></article>
        </div>
        <!-- item: -->
        <div data-item-viewport data-item-type data-item-id></div>
      </div>
    </section>
  </div>
  <aside data-existing-frames hidden></aside>
</div>
```

- [ ] **Step 1: Test `renderWorkbenchContainer(empty)` includes `data-container-home` and no `data-window-id`.** Test with one frame tab includes `data-frame-id` and one `data-block-id`.

- [ ] **Step 2: Run — Expected: FAIL missing module.**

- [ ] **Step 3: Implement render + CSS (tab strip, tiled grid, float `position:absolute` inside container, canvas `overflow:hidden` with transform from camera). Insert Container as the first child of `data-plugin-stage` in `goals-page-renderer.ts`. Existing surfaces stay for directory-driven legacy until later tasks hide them when Container has tabs.**

- [ ] **Step 4: `pnpm --filter @adeptify/goalboard-app-workbench build` and shell test PASS. Also run `tests/workbench-ui-platform.test.ts` and update slot set assertions to include `workbench.tab-body` and `workbench.block`.**

---

### Task 5: Directory click opens a Frame Tab

**Files:**
- Create: `apps/workbench/src/scripts/client/container.ts` (factory script)
- Modify: `apps/workbench/src/browser-assets.ts` insert container script before `CLIENT_INITIALIZATION_SCRIPT`
- Modify: `apps/workbench/src/scripts/client/events-primary.ts` and Goals tree click path: when immersive workbench and the click is a Goal/Session/Feed/Artifact **item** (not plugin root / home / market), prevent the old `setDesktopWorkSurface` takeover and dispatch `open_frame_for_item`
- Modify: `apps/workbench/src/scripts/client/initialization.ts` GET container on load
- Test: `tests/workbench-container-open.e2e.test.ts` using existing `openGoalBrowser` isolation

**Interfaces:**
- Consumes: POST `/api/workbench/command`, GET container
- Produces: browser `containerClient.openDirectoryItem(item)`

Goal tree rows already have goal ids in `data-goal-id` (confirm in `plugins/native/goals` directory markup; use the actual attribute). Session rows: `data-session-id` from Work directory. Feed: `data-feed-entry-id`. Artifacts: existing detail id.

Item refs:

| Plugin | item_type | plugin_id |
| --- | --- | --- |
| Goals | `goal` | `io.goalboard.native.goals` |
| Work | `session` | `io.goalboard.native.work` |
| Feed | `feed_entry` | `io.goalboard.native.feed` |
| Artifacts | `artifact` | `io.goalboard.native.artifacts` |

After successful command: re-render Container from returned document (client-side `renderWorkbenchContainer` cannot run TS in the string script — either return HTML fragment from Host `GET ?format=html` **or** build DOM in the factory from JSON). Prefer **JSON + DOM builder in the factory** so the reducer stays on Host. Duplicate only the markup hooks, not the command rules.

When Container `session.tabs.length > 0`, hide legacy `[data-work-surface]` except they may still be used as mount sources to clone into block bodies in Task 6.

- [ ] **Step 1: E2E: isolated project, open Goals directory, click a goal, assert `[data-workbench-container] [data-tab-kind="frame"]` count is 1 and `[data-item-type="goal"]` block exists. Click a second goal, count is 2.**

- [ ] **Step 2: Run e2e — Expected: FAIL no container tabs.**

- [ ] **Step 3: Implement fetch/command/DOM sync and intercept item clicks. Home / market / plugin-strip / directory-back keep old behavior.**

- [ ] **Step 4: Re-run e2e + `tests/immersive-directory.e2e.test.ts` to catch navigation regressions.**

---

### Task 6: Frame canvas — pan, zoom, extra Blocks

**Files:**
- Modify: `apps/workbench/src/scripts/client/container.ts`
- Modify: `apps/workbench/src/container/styles.ts`
- Modify: Goals/Work/Feed/Artifacts to declare a `block` surface targeting `workbench.block` that renders a compact working card (title + type). First slice may reuse existing row/title HTML, not the full Goal workspace.
- Test: extend `tests/workbench-container-open.e2e.test.ts` and add `tests/workbench-container-canvas.e2e.test.ts`

**Interfaces:**
- Pointer on canvas background: pan → `set_frame_camera`
- Ctrl/Meta+wheel: scale 0.25–3 → `set_frame_camera`
- Drag directory item onto `[data-canvas]`: `add_block_to_frame` at drop coordinates in canvas space
- Drag `[data-block-id]` inside canvas: `set_block_rect` on pointerup
- Mount plugin block HTML into each `article[data-block-id]` via UiHost `workbench.block` (server-render on command response as `block_html` map **or** client fetch fragment). Simplest: POST command returns `{ document, block_html: Record<block_id, string> }` from Host calling UiHost.render. Implement that Host enrichment in this task.

- [ ] **Step 1: Test drag-drop of a second Goal onto the open Frame canvas → two `[data-block-id]` in the same `[data-frame-id]`, still one frame Tab.**

- [ ] **Step 2: FAIL then implement drop + camera + block mount.**

- [ ] **Step 3: Unit-test camera clamp in reducer if not already in Task 2.**

---

### Task 7: Item Tabs for Terminal and Browser

**Files:**
- Modify: `plugins/native/work/src/ui/` to add surfaces `viewport-terminal` and `viewport-browser` targeting `workbench.tab-body`
- Modify: Work create-session / PTY start APIs already used by the Goal TUI — reuse, do not start a runtime on directory click
- Add chrome buttons in immersive header: 「终端」「浏览器」 calling `open_item_tab` with `reuse_existing: false` after Work creates a new terminal/browser item id
- Test: `tests/workbench-container-item-tabs.e2e.test.ts`

**Interfaces:**
- Single-open Terminal: Work creates PTY/session id → command `{ type: "open_item_tab", item: { plugin_id: work, item_type: "terminal", item_id }, reuse_existing: false }`
- Same for Browser with Work's existing browser view
- POST command `disposed_items` for `terminal`/`browser` → Host calls the existing Work shutdown used when a Goal TUI disconnects (find the current function in Work plugin / local-host PTY controller and call it; do not invent a second process killer)
- Background Tab: keep terminal DOM attached (`hidden`/`inert`), do not destroy PTY (already spec'd)

- [ ] **Step 1: E2E click 终端 → item Tab in strip, `[data-item-viewport][data-item-type="terminal"]` present. Open two terminals, close one, the other PTY still accepts input. Close last → Work reports the session gone (reuse existing Work assertions).**

- [ ] **Step 2: FAIL then implement. Goal directory click must still open Frames, not terminals.**

---

### Task 8: VSCode tab drag, split, float

**Files:**
- Modify: `apps/workbench/src/scripts/client/container.ts` (tab pointer model)
- Modify: `apps/workbench/src/container/styles.ts` (insertion caret, drop edge highlights)
- Test: `tests/workbench-container-dnd.e2e.test.ts`

**Interfaces:**
- Tab reorder in the same strip: `move_tab` with same `to_window_id` and new index
- Drop on another window's strip: `move_tab`
- Drop on container empty chrome (not on a canvas): `detach_tab_to_float` with bounds under pointer
- Drop on a tiled window's left/right/top/bottom 12px edge: `split_window`
- Visual: a 2px insertion line between tab buttons; edge overlay `data-split-preview`

Do not implement OS window dragging. Float windows are `position:absolute` inside `[data-workbench-container]`, drag via tab strip empty area, close via tab close.

- [ ] **Step 1: Playwright/internal browser: two frame tabs, drag second before first, assert DOM order. Drag first onto right edge, assert two `[data-window-id]`. Drag a tab to empty area, assert `data-window-mode="float"`.**

- [ ] **Step 2–4: FAIL / implement / PASS.**

---

### Task 9: Tear-off Block clones Item viewport

**Files:**
- Modify: container client drop target when a block is dropped outside its canvas
- Test: extend dnd e2e

**Interfaces:**
- Drop block on empty container / another window tab strip / another window body (not a canvas): `clone_item_viewport` with that item. Original block still in frame.
- Drop block onto a **different** frame canvas: `add_block_to_frame` on the target (same item, new block id).
- Double-click block: `open_item_tab` with `reuse_existing: true` (focus existing viewport if any).

- [ ] **Step 1: E2E: one Goal block, drag out → new item Tab for same `data-item-id`, original `data-block-id` still in frame. Double-click the remaining block focuses the existing item Tab (tab count unchanged).**

- [ ] **Step 2–4: FAIL / implement / PASS.**

---

### Task 10: Close, reopen, project switch, refresh

**Files:**
- Modify: container client + `render.ts` for `[data-existing-frames]`
- Modify: project switcher in `apps/workbench/src/scripts/client/plugin-workbench.ts` / events-primary: after project change, GET the new project's container (today switcher reloads the page — if it still reloads, GET on init is enough; do not add a second project-switch path)
- Test: e2e two-project isolation (pattern from immersive workbench project-plugin tests)

**Interfaces:**
- Tab close button → `close_tab`
- `[data-existing-frames]` lists frames with no open frame Tab; click → `reopen_frame`

- Delete in that list → `delete_frame`
- Empty tabs → show home
- Reload page → GET restores session

- [ ] **Step 1: Tests: close frame tab, list shows it, reopen; switch project A→B shows B's tabs not A's; reload restores A after switching back.**

- [ ] **Step 2–4: FAIL / implement / PASS including `disposed_items` for last terminal tab.**

---

### Task 11: Viewport mounting and failure isolation

**Files:**
- Modify: Host command response to include `tab_html` / `block_html` from UiHost.mount into `workbench.tab-body` / `workbench.block`
- Modify: Goals document, Feed detail, Artifact detail, Work session, Work terminal, Work browser contributions: add surfaces with `target_slot_id: "workbench.tab-body"` **in addition to** existing `workbench.main` so directory legacy still mounts
- Test: `tests/workbench-ui-platform.test.ts` plus a unit test that a contribution throwing while rendering one tab does not prevent `applyWorkbenchCommand` or rendering sibling windows (container render catches per-tab errors and inserts `[data-tab-error]` with retry)

- [ ] **Step 1: Test UiHost mounts `workbench.tab-body`. Test render skips a throwing tab and still outputs the other window.**

- [ ] **Step 2–4: Implement per-tab try/catch in Host HTML enricher and client innerHTML assignment.**

Full Goal workspace (terminal + timeline) loads only in the **item viewport**, not inside the Block card. Block card stays compact.

---

### Task 12: i18n, narrow viewport, spec acceptance sweep

**Files:**
- Modify: `apps/workbench/src/i18n/en.ts` for 终端, 浏览器, 已有工作, 关闭标签, 新窗口, 打开失败
- Modify: `apps/workbench/src/styles/responsive.ts` and container styles: `max-width: 600px` forces one tiled window, hide float, ignore split drops
- Test: existing 390px immersive tests plus one container test at 390px that still can open a Frame tab from the drawer

- [ ] **Step 1: Assert English strings exist for every new `L("…")` added.**
- [ ] **Step 2: Run `pnpm --filter @adeptify/goalboard-app-workbench typecheck`, `pnpm --filter @adeptify/goalboard-ui-host typecheck`, `pnpm --filter @adeptify/goalboard-contracts typecheck`, `pnpm boundary:check`, scoped e2e listed in Tasks 5–11.**
- [ ] **Step 3: Walk spec 验收标准 table. Record narrow-viewport actual capability in the spec 验收 row (desktop multi-window vs single window on phone).**

---

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| Point directory → new Frame Tab + Block | 5 |
| Drag onto canvas → extra Block | 6 |
| Single-open Browser/Terminal as Item Tabs | 7 |
| Tear-off clone viewport + tab | 9 |
| VSCode tab reorder / move / float / split | 8 |
| Project isolation + restore | 10 |
| Close Frame keeps composition; last terminal disposes PTY | 2, 7, 10 |
| Refresh restores | 3, 10 |
| Plugin errors isolated | 11 |
| i18n / light-dark / directory width | 4, 12 (styles inherit immersive tokens) |
| No OS windows, no chat, no Artifact identity | Global constraints |
| Empty container = project home | 4 |
| 已有工作 reopen | 10 |
| Narrow downgrade | 12 |

## Execution notes

Reducer is the source of truth. If a client gesture cannot be expressed as `WorkbenchCommand`, add a command in Task 2 first, then UI.

Do not replace Goals momentum canvas with the Frame canvas. A Goal Block is a card; opening the viewport may show the existing Goal workspace (including its own graph) inside `data-item-viewport`.
