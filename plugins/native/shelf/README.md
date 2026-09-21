# Shelf 置物架入口

把 DropAgent 的材料 / 结果 / 剪贴板工作台挂进 Molis 目录与主工作面，视觉与交互跟 DropAgent。

包名：`@molis-ai/molis-work-plugin-shelf`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 把架子快照交给 UI contribution；HTTP 路由表拥有 `/api/shelf` 匹配，Host 注入 admit / job / file。快照带上本机 Agent 状态和整张 Recipe 表，动作栏按选中材料挑该用的动作。插件不写项目 Goal。在项目内可预览并确认「保存到项目材料」：Host 将当前完整文字发布为 `shelf.text-material.v1`，保留原 Shelf 来源和实际内容指纹。重复保存未变正文复用版本，编辑产生新版本；个人架子的编辑、隐藏或移除不改项目里的旧版本。PDF/图片先使用已有提取动作转成文字。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 目录与工作面 HTML |
| [src/styles.ts](src/styles.ts) | DropAgent 表面样式 |
| [src/client.ts](src/client.ts) | 选择、多选、动作栏、确认与运行 |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/settings-ui.ts](src/settings-ui.ts) | 六段用途堆叠的设置页 |
| [src/terminal-client.ts](src/terminal-client.ts) | 「对话」的终端井，接 `/pty` |

可对照 [apps/workbench/src/goals-page-renderer.ts](../../../apps/workbench/src/goals-page-renderer.ts) 与 [apps/local-host/src/shelf-native-plugin-http.ts](../../../apps/local-host/src/shelf-native-plugin-http.ts)。

## 接入与边界

不依赖 Goals / Artifacts 实现。项目 Artifact 写入由 Host 注入公开端口，全局 Shelf 未绑定项目时不能发布；个人副本与 UI 仍按 native 方式装配；项目材料输出由 `createShelfPlugin` 在正式 Runtime 中启动，使用原 grants 与持久连线服务。Coding 声明消费该材料类型，经原授权读取精确版本。保存固定版本后可明确「设为材料输出」，默认连到 Coding 的 materials 输入。保存不自动切换输出，输出切换不改已有会话选择；旧确认不能覆盖后来选择，跨项目、归档或非自身材料不能设为输出。样式不吃 Coss `interaction-texture`，新确认入口使用共享控件。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-plugin-shelf typecheck
pnpm --filter @molis-ai/molis-work-plugin-shelf build
pnpm test:run tests/shelf-plugin.test.ts tests/shelf-coding-materials-http.test.ts tests/shelf-plugin.e2e.test.ts
```

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [Shelf 插件需求](../../../specs/shelf-plugin/spec.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`
