# 插件详情：返回和第一行同一条

状态：已落地。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

插件详情顶栏现在只有一个 `<`，下面才是第一行内容，看起来空。一骏 2026-09-20 选中 Inbox `.plugin-stage-detail-bar`：返回和「Inbox · 来源规则 / GitHub / 待处理」分成两层。要求所有插件要么箭头跟第一行齐，要么把第一行拿到这条 bar 上。

## 当前行为与问题证据

Goal：`.goal-node-toolbar` 里是返回 + 标题。Session：`.session-stage-bar` 里是返回 + 身份 + 动作。

Inbox / Feed / Artifacts：`.plugin-stage-detail-bar` 只有返回钮，密度下仍占 32px 整行。Inbox 第一行是 `.feed-detail-kicker` 芯片。Feed 芯片在插槽 HTML 里，和返回条是兄弟。Artifacts 下一行才是标题。Shelf 宽屏展开后，空的返回条叠在 `.shelf-chrome` 文件名上。

## 范围与非目标

做：Inbox 芯片进返回条。Artifacts 标题和版本进返回条。Feed 空返回条叠在芯片行上，不另占高度。Shelf 返回和文件名同一条。Goal / Session 已有身份行，不改结构。

不做：不改返回语义、列表主从、阅读标题字号、DropAgent 阅读面。

## 方案

- Inbox：kicker 放到 `.plugin-stage-detail-bar` 里，标题仍在 `.feed-detail-header`。
- Artifacts：标题和版本放到 `.plugin-stage-detail-bar` 里，不再另起身份行。
- Feed 仍只有返回钮的条加 `data-stage-back-only`，绝对定位到详情顶。
- Shelf：返回钮、文件名、「材料 · PDF」放进同一条 `.plugin-stage-detail-bar.shelf-chrome`，不叠、不另起一行。宽屏也显示这条（点返回收回全宽列表）。
- Session / Goal 维持现有条。

## 文件边界

允许：`plugins/native/inbox/src/ui.ts`、`plugins/native/{feed,artifacts,shelf}/src/ui.ts` 或 `browser-ui.ts`（只加 `data-stage-back-only`）、`apps/workbench/src/styles/{plugin-stage,detail-reading,linear-density}.ts`、对应测试、本 spec。

## 验收标准

1. Inbox 详情：`.plugin-stage-detail-bar` 内同时有返回钮和 `.feed-detail-kicker`；条高度约 32px，不是空的整行。
2. Artifacts 详情：返回钮和 `h1` / 版本在同一条 `.plugin-stage-detail-bar` 里，不套 `data-stage-back-only`。
3. Feed 空返回条 `position: absolute`，不把第一行往下推 32px。
4. Shelf 详情：返回钮和文件名 / 「材料 · PDF」在同一条 `.plugin-stage-detail-bar`，互不遮挡；不套 `data-stage-back-only`。
5. Goal 工具栏、Session 条仍是返回 + 身份，不套 `data-stage-back-only`。
6. 返回仍能收起详情。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-plugin-artifacts --filter @molis-ai/molis-work-plugin-shelf build
node --import tsx --test --test-concurrency=1 tests/inbox-native-plugin.test.ts tests/chrome-inner-scroll.test.ts
```

4174 打开 Inbox / Feed / Artifacts / Shelf / Session / Goal 详情，看返回和第一行是否同一条。
