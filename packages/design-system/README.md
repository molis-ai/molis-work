# 共享视觉与偏好

集中管理主题、密度、终端主题、图标和通用样式，使页面和 Native Plugin 使用同一套视觉基础。

包名：`@molis-ai/molis-work-design-system`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

页面注入 THEME_BOOTSTRAP_SCRIPT、VISUAL_FOUNDATION_STYLES 和客户端偏好脚本；图标经 icon/renderIconSprite 输出。Workbench 负责页面组合，具体功能 UI 消费这些基础能力。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/visual-foundation.ts](src/visual-foundation.ts) | 公共主题与样式入口 |
| [src/preferences.ts](src/preferences.ts) | 偏好实现 |
| [src/icons.ts](src/icons.ts) | 图标输出 |
| [src/styles](src/styles) | 样式责任分区 |

可对照现有调用方 [apps/workbench/src/renderer.ts](../../apps/workbench/src/renderer.ts) 阅读装配方式。

## 接入与边界

这里提供 CSS、脚本和视觉 primitives，不负责业务数据、路由或目标状态判断。修改共享样式时应检查实际 Workbench 页面及窄屏状态，单纯编译不能证明视觉效果。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-design-system typecheck
pnpm --filter @molis-ai/molis-work-design-system build
```

已有行为示例与回归：[visual-foundation.test.ts](../../tests/visual-foundation.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/visual-foundation.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/platform/UI-PLATFORM.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/ui`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
