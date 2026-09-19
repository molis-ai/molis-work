# 插件详情返回箭头对齐 Goal

状态：完成。完成等级 **3：功能可用**。不改用户库、不提交、不发布。

## 背景目标

Artifacts 详情里的返回箭头和其他插件、Goal 不在同一条竖线上。用户要求所有插件按 Goal 工作区那个箭头的位置对齐。

## 当前行为与问题证据

Goal：`.goal-node-toolbar` 左内边距 `20px`（工作台密度 `10px`），`.goal-node-back` 再 `margin-left: -6px`。

插件共用 `.plugin-stage-detail-bar`：`padding: 8px 16px 0`，没有光学左移。Sessions：`.session-stage-bar` 左 `16px`。

Artifacts 另有两处把箭头推走：

1. `.plugin-stage-workspace .artifact-detail { max-width: 800px; margin: 24px auto; }` 把整篇详情（含返回）居中。
2. `.artifact-detail header` 的标题样式（`margin: 20px 0`、`align-items: baseline`、`padding: 12px 20px`）打在返回条上。

Inbox 把返回条嵌进已有 `16px 20px` 的 `.feed-detail-header`，左距叠了两层。

实测 Artifacts 返回钮 `left=428`，相对详情栏明显比 Goal 靠里、靠下。

## 范围与非目标

做：Feed / Inbox / Artifacts / Shelf / Sessions 的返回箭头相对**详情栏左上**对齐 Goal `.goal-node-back`（含工作台密度）。Artifacts 详情在舞台里不再居中卡片。Inbox 返回条与 Feed 一样单独成条。

不做：不改主从列宽、不把列表收掉、不改返回语义、不加 Coss 新组件、不改独立 Artifact 页。

## 使用场景

1. 打开一条 Goal：箭头在工作区顶栏左缘。
2. 打开 Artifact / Feed / Inbox / Shelf / Session 详情：箭头相对右侧详情栏的左缘、顶缘与 Goal 同一套。
3. 窄屏 / 粗指针：返回钮仍是 44px 目标，位置规则不变。

## 方案

详情栏 padding 与 Goal 工具栏相同；返回钮共用 `margin-left: -6px`。取消舞台里 Artifact 的 `800px / 24px auto`。标题 header 选择器排除 `.plugin-stage-detail-bar`。Inbox 把返回条提到 `feed-detail-header` 外面。

## 文件边界

允许：`apps/workbench/src/styles/{plugin-stage,linear-density,detail-reading,immersive-navigation,surface-language}.ts`、`apps/workbench/src/artifact-ui.ts`、`plugins/native/{inbox,work}/src/ui/{ui.ts,render.ts,styles.ts}`、对应测试、`DESIGN.md` 一句。

## 验收标准

1. 工作台 CSS：`.plugin-stage-detail-bar` 与 `.session-stage-bar` 的左内边距与 `.goal-node-toolbar` 同一套；返回钮有 `margin-left: -6px`。
2. 舞台内 `.artifact-detail` 不再 `margin: 24px auto` / `max-width: 800px`。
3. Inbox 标记 `data-inbox-collapse` 的条在 `.feed-detail-header` 之前，不在它内部。
4. 宽屏点开详情后，返回钮相对 `.plugin-stage-workspace` / `.session-stage-workspace` 的 left 与 Goal 相对其工作表面的 left 差 ≤ 2px（密度已应用）。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-plugin-work build
node --import tsx --test --test-concurrency=1 tests/chrome-inner-scroll.test.ts tests/inbox-native-plugin.test.ts
```

## 假设与开放问题

4174 吃模块缓存，改 CSS / 插件 HTML 后要 rebuild 并重启才看得到。

Session 详情条还带着标题和操作，竖向会比 Goal 工具栏高一截；左距已按同一套 inset 对齐。不在本切片改 Session 条的内容结构。

## 验收对照

| # | 标准 | 结果 | 证据 |
|---|------|------|------|
| 1 | 详情栏左内边距与 Goal 工具栏同一套；返回钮 `margin-left: -6px` | 通过 | `chrome-inner-scroll.test.ts`；密度下 `padding: 4px 10px`，钮 `-6px` |
| 2 | 舞台内 Artifact 详情不再居中卡片 | 通过 | CSS `max-width: none; margin: 0`；实测 `article.margin 0px` |
| 3 | Inbox 返回条在 `.feed-detail-header` 之前 | 通过 | `inbox-native-plugin.test.ts`；4174 HTML 先 `plugin-stage-detail-bar` |
| 4 | 宽屏详情返回钮相对工作区 left 与 Goal 差 ≤ 2px | 通过 | 4174：Goal / Artifact / Feed / Inbox / Shelf / Session 均为 inset 4px、left 292 |

`detect.mjs --scope layout`：无发现。
