# 插件工作面、Inbox 主信息、Artifact 标题

状态：完成。完成等级：3 功能可用。修正 immersive 里 Inbox / Feed / Artifacts 点不开、Inbox 详情主信息排错、Artifact 列表露内部 id。

承接 `specs/inbox-feed-plugin-split/spec.md` 浏览器走查，以及 `specs/workbench-frame-container/spec.md` 里「点目录非 Goal 在 Goal 画布上拒绝」的过宽实现。

## 背景目标

Goal 画布只放 Goal，Frame 只收拖进去的工作内容。这不错。但实现把「点 Inbox / Feed / Sessions / Artifacts 插件」也锁死在 Goal 画布上，目录行点击还被当成丢进 Frame。结果插件详情永远看不见。

Inbox 详情 CSS 把定义列表最后一项当主信息。拆插件后最后一项是「当前状态」，「下一步」被挤下去。

Artifacts 浏览器用 `artifact_id` 当标题。Feed capture 的 id 是 `feed-capture:feeditem-…:feedoutrule-…`，人读的是 payload 里的 title。

## 当前行为与问题证据

- `events-secondary.ts`：有 `[data-goal-canvas-shell]` 时，打开 sessions/feed/inbox/artifacts 只换目录，工作面强制 `goal`。
- `documents-state.ts`：恢复状态时同样把这四个表面改回 `goal`。
- `frame-container.ts` 捕获阶段点击：只要当前工作面是 `goal`，点非 Goal 行就 `routeAsset`；画布 Tab 上会 toast「先打开某个 Goal 的 Frame」。
- 来源页不受这套拦截，所以能打开工作面。
- `.inbox-attention-context dl > div:last-child` 强调最后一项；HTML 顺序末项是「当前状态」。
- `plugins/native/artifacts/src/browser-ui.ts` 的 `<strong>` / `<h1>` / Frame 阅读卡标题都是 `artifact_id`。

## 范围与非目标

做：

1. 当前是 Goal 画布 Tab（或没有激活的 Frame）时，点插件条 / 根目录 / 目录行，打开对应插件工作面并选中该条。
2. 当前是某个 Goal 的 Frame Tab 时，点目录非 Goal 行仍加入当前 Frame；点插件条只换目录、不抢走 Container。拖到 Goal 画布仍拒绝。
3. Inbox 详情主信息是「下一步」。
4. Artifact 目录、详情、独立页 `<title>`、Frame 阅读卡优先显示 payload 里可读的 `title` / `name` / `text` 首行；没有才回退 `artifact_id`。精确版本引用不变。

不做：改 Frame 构图存储、把插件整页塞进 Block、来源拆插件、自定义 Artifact renderer、改 disposition / Feed Module owner。

## 使用场景

1. 空项目点 Inbox → 右边是 Inbox 详情（或空态），不是空 Goal 画布。点条目能完成 / 忽略 / 查看原消息。
2. 点 Feed 行 → 打开 Feed 正文。点来源 → 仍是来源工作面。
3. 点 Artifacts 行 → 打开该版本；目录上看到「Product launch checklist」，不是 lineage id。
4. 先打开某 Goal 的 Frame，再点 Feed 行 → 仍变成 Frame 上的 Block，不跳走。
5. 拖 Feed 到 Goal 画布 → 仍 toast 拒绝。

## 方案与关键决策

1. **Frame 激活才拦截行点击。** `isFrameTabActive()` 为真：保持现有「点击 = 拖入 Frame」。为假：放行，由插件自己打开工作面。
2. **打开插件时看 Frame。** Frame 激活：只换目录、工作面留在 `goal`（Container 还在）。否则：`setDesktopWorkSurface` 到该插件。
3. **刷新恢复真实工作面。** 不再因为有画布壳就把 inbox/feed/sessions/artifacts 改回 `goal`。保存值若是 `goal`，Frame Tab 仍按原逻辑恢复。
4. **Inbox 主信息用 class，不靠 nth-child。** `inbox-attention-next` 提前并放大；不再用 first-child / last-child 强调。
5. **标题启发式只在 Artifacts 插件 UI。** 不让 Feed 插件画 Artifact 列表。不改 `artifact_id`。

这是对 Frame spec「点目录非 Goal（当前是 Goal 画布）→ 拒绝」的修正：拒绝只针对**拖到画布**；点击改为打开插件工作面。Frame Tab 上的点击语义不变。

## 输入输出与依赖

输入：插件条、根目录、目录行点击、Frame Tab 是否激活、Artifact payload。  
输出：对应 `data-work-surface` 可见；Inbox 主信息为下一步；Artifact 人读标题。  
依赖：现有 Host `setDesktopWorkSurface` / `frameContainer.isFrameTabActive`、Artifacts UI contribution。  
不依赖：新 Module、新 HTTP。

## 文件 / 模块边界

- 改：`apps/workbench/src/scripts/client/events-secondary.ts`、`documents-state.ts`、`frame-container.ts`
- 改：`packages/design-system/src/styles/source-feed.ts`、`plugins/native/inbox/src/ui.ts`
- 改：`plugins/native/artifacts/src/browser.ts`（标题函数）、`browser-ui.ts`
- 改：`specs/workbench-frame-container/spec.md` 打开表
- 测：现有 immersive / Frame / artifact-browser / inbox-plugin 定向；按新语义改断言
- 不改：`modules/artifacts`、`modules/feed`、Frame 构图 localStorage 形状

## 验收标准

- 无激活 Frame 时，点 Inbox / Feed / Sessions / Artifacts 插件，工作面是该插件，标题栏不是「Goal 画布」。
- 无激活 Frame 时，点 Inbox / Feed / Artifact 行打开详情，不出现「先打开某个 Goal 的 Frame」。
- 有激活 Frame 时，点这些行仍加入 Frame Block；工作面仍是 `goal`。
- 拖到 Goal 画布仍拒绝。
- Inbox 详情视觉上「下一步」在定义列表最上、字号最大；「当前状态」不再当主信息。
- `io.molis.work.feed.capture` 目录和详情标题是 payload.title；没有 title/name/text 时仍显示 artifact_id。
- `pnpm boundary:check` 通过。

## 验证命令

```sh
pnpm --filter @molis-ai/molis-work-plugin-artifacts --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-design-system build
pnpm boundary:check
node --import tsx --test tests/artifact-browser.test.ts tests/inbox-plugin.test.ts tests/inbox-native-plugin.test.ts
node --import tsx --test --test-concurrency=1 tests/workbench-frame-container.e2e.test.ts tests/immersive-workbench.e2e.test.ts tests/immersive-directory.e2e.test.ts tests/chrome-inner-scroll.e2e.test.ts
```

浏览器：隔离项目走 Inbox 详情完成/忽略、Feed 正文、Artifacts 人读标题；再开 Frame 确认点行仍进 Block。

## 假设与开放问题

- Sessions 与 Inbox/Feed/Artifacts 同一规则，避免插件条三种行为。
- payload 标题只认 string 的 title / name / text 首行；不扫任意字段。
- 窄屏仍用现有 `moveToDetail` 切到文档；不另做手势。
