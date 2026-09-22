# Shelf 设置：压扁内页导航，理顺内容归属

完成等级：**3 功能可用**。不改数据、不提交、不发布。

## 背景目标

Shelf 挂在工作台全局设置里。工作台已经有「设置 → Shelf」这一层。页里再套一套六段导航，右栏 h2 再重复当前段名，Agent 目录还同时出现在「权限与连接」和「Agent 与存储」。读起来像设置里再开一个设置 App。

## 当前行为与问题证据

2026-09-21 一骏圈出 `.settings-content[data-settings-stage-body]`：标题 Shelf、左侧六段、右侧再写一遍「权限与连接」，下面是 Grok/Claude 目录和系统权限。

- `renderShelfSettings` 在 `settings-document` 里再做 `nav.shelf-settings-nav`（188px）+ `hidden` pane。
- 内容栏约 606px 时，内导航吃掉近三分之一。
- `setupPane` 画 runtime catalog；`machinePane` 再画引擎单选。同一批 Agent 分两处。

## 范围与非目标

做：去掉内页第二套 tab；六段用途改成单栏堆叠卡片；「权限与连接」只留系统权限；Agent 状态、目录、选择、自定义 Runtime、存放位置都进「Agent 与存储」；未装引擎在选择行上保留「安装说明」。

不做：不改预览、轮盘、纸钮、五色图标；不把灵光快记流收成目录；不改 Feed/Inbox 行；不把 DropAgent 设置语义改成 Coss 组件。

## 方案

工作台左侧设置目录已经负责在插件之间跳。Shelf 页只负责自己的六段内容，从上往下排，跟外观页同一套 `settings-heading` + `settings-section`。

| 段 | 留下什么 |
|---|---|
| 权限与连接 | 辅助功能、Finder、浏览器、剪贴板，加一句按需授权 |
| 快捷动作 | 动作栏顺序/显隐，我的动作 |
| 快捷键 | 全局三条，面板内四条 + 方向键只读 |
| 使用指南 | 示例 PDF，能做什么 |
| Agent 与存储 | 当前 Agent 一句、选择（含安装说明）、自定义 Runtime、存放路径 |
| 外观 | 拖放轮盘，主题语言跟 Molis |

## 文件边界

允许：`specs/archive/shelf-settings-flatten/`；`specs/shelf-plugin/spec.md`；`plugins/native/shelf/src/settings-ui.ts`、`settings-client.ts`、`styles.ts`；`plugins/native/shelf/README.md`；`tests/plugin-global-settings.test.ts`；`tests/shelf-plugin.e2e.test.ts`；对照图 README。

## 验收

1. HTML 没有 `data-shelf-settings-tab` / `shelf-settings-nav`。
2. 六个 `data-shelf-settings-pane` 同时可见，没有 `hidden`。
3. 「权限与连接」不含 runtime catalog / `data-shelf-engine`；Agent 段含 `data-shelf-engine` 和 `data-shelf-agent-line`。
4. 4184 打开 `/settings/shelf`：一栏六张卡片，标题只出现一次，Agent 不在权限段里。

## 验证命令

```
node --import tsx --test --test-concurrency=1 tests/plugin-global-settings.test.ts
pnpm --filter @molis-ai/molis-work-plugin-shelf typecheck
```

4184 打开设置 → Shelf，对照原先那张内页两栏截图。
