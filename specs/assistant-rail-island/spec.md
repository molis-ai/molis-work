# 左栏个人岛：灵光 + Assistant 入口

状态：已验收。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

左栏 `.plugin-stack` 现在是三块竖卡：项目岛、插件列表、设置+头像。灵光夹在 Shelf 和 Functions 中间，和 Goals / Pages 同一串。要把「记一笔」和「跟 Molis Work 说话」从工作插件里拆出来，单独成卡，作为以后 Assistant 的输入入口。

## 当前行为与问题证据

- 灵光是 `plugin-rail-items` 里的一项，点它开灵光舞台。
- 没有对话图标，没有从左栏弹出的输入浮窗。
- 首页旧 composer 已去掉。设置里的模型供应商没有接到工作台壳。

一骏 2026-09-21 选中 `.plugin-stack`：单独切一个容器放灵光；同卡放对话图标；点对话在这里弹出圆角输入框（模型选择 + 发送），给后续 Molis Work Assistant 用。位置：**项目岛上面**。

## 范围与非目标

做：

1. `.plugin-stack` 第一块卡：灵光 + 对话图标。桌面贴 titlebar 底，在项目岛上面，缝仍是 `--plugin-rail-gap`（8px）。
2. 灵光从 `.plugin-rail-items` 拿掉。点灵光仍开现有灵光舞台，不改灵光存盘、列表、头脑风暴。
3. 点对话：一条搜索框高度的输入条贴在按钮右侧打开（约 32px 高，不是两层卡片）。输入、模型选择、发送同一行。点外侧 / Esc 关掉。切插件时入口还在。
4. 发送是壳：有字才提交，提示「对话尚未接入」，不编回复、不落对话、不调 Runtime。
5. 模型选择可见。当前没有工作台可读的模型列表 API，选择器显示「还没有可用模型」并禁用。不新开模型 HTTP、不把 Runtime 列表冒充模型。

不做：接通 Assistant / Harness、聊天历史、把灵光头脑风暴并进浮窗、搬回首页 composer、改插件市场/启用名单、改灵光 SQLite。

## 使用场景

1. 打开项目：左栏从上到下是个人岛 → 项目岛 → 插件列表 → 设置+头像。插件列表里没有灵光。
2. 点灵光：灵光列表照常打开；对话浮窗若开着则关掉。
3. 点对话：当前插件舞台不动，按钮右侧出现一条矮输入条（垂直中线对齐按钮）。能选（当前为空）模型，能输入，发送得到尚未接入的诚实提示，草稿还在。
4. ≤600px：个人岛仍在项目岛上面，横排两个图标；插件抽屉起点下移，不被挡住。

## 方案与关键决策

- 个人岛是工作台壳，不是新插件。对话图标没有 `data-plugin-id`。
- `railEntries()` 仍含灵光（目录/市场/Manifest 推导不变）。只在 `renderPluginRail` 里不画灵光。
- 浮窗用 `popover="auto"`，固定定位到对话按钮右侧 8px，垂直居中对齐按钮。单行 `[输入][模型][发送]`，高度对齐左栏图标（32px），不要 textarea + 底栏两层卡片。输入条内部不再套焦点描边。
- 完成等级 3：壳可点、可输入、可关；不宣称 Assistant 可用。

## 输入输出与依赖

输入：现有 plugin-stack、灵光按钮、模型设置尚未对工作台暴露的列表。  
输出：四块左栏卡、对话浮窗壳。无新协议。

## 文件 / 模块边界

允许改：`apps/workbench/src/immersive-shell.ts`、`goals-page-renderer.ts`、`styles/immersive-navigation.ts`、`styles/linear-density.ts`、`styles/tab-workspace.ts`、`scripts/client/assistant-island.ts`、`scripts/client/initialization.ts`、`scripts/client/immersive-navigation.ts`、`scripts/client/tab-workspace.ts`、`i18n/en.ts`；`packages/design-system/src/styles/interaction-texture.ts`、`palette.ts`、`calm-desktop.ts`、`quiet-paper.ts`、`momentum.ts`；相关测试与本 spec。

不改：灵光插件实现、模型供应商存储、Agent Host、首页。

## 验收标准

1. 桌面 1440：个人岛在项目岛上面；个人岛底到项目岛顶 = 8px ±2；项目岛底到 `.plugin-rail-items` 顶仍 = 8px ±2。
2. `.plugin-rail-items` 没有 `data-plugin-id="lingguang"`；个人岛有灵光和对话按钮。
3. 点灵光仍打开灵光舞台。
4. 点对话出现贴按钮右侧的输入条：高 ≤40px，左缘距按钮右缘 8px ±12，垂直中线对齐按钮 ±8；含输入、模型选择、发送；再点外侧或 Esc 关掉；当前插件不切走。
5. 发送有字时提示尚未接入，不出现假回复。
6. 完成等级 3。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/lingguang-plugin.test.ts \
  tests/chrome-inner-scroll.test.ts \
  tests/desktop-tui.test.ts \
  tests/primitives.test.ts \
  tests/i18n.test.ts \
  tests/lingguang-plugin.e2e.test.ts \
  tests/immersive-directory.e2e.test.ts
```

## 假设与开放问题

- 发送保持壳，直到 Assistant 通道存在。
- 模型选择等有工作台可读的模型列表再填真实选项。
