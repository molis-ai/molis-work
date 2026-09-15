# F2 Monorepo Workspace Package 树验证记录

日期：2026-09-02  
Goal：`goal-reorg-f2`  
Contract revision：1  
完成等级：工程底座功能可用；不代表 48 个 package 的业务功能已经实现。

## 交付结果

F2 已把 F1 确认的完整包地图变成真实 pnpm workspace：

| 分区 | package 数量 |
| --- | ---: |
| Apps | 6 |
| Foundation | 10 |
| Modules | 16 |
| Horizontal Services | 4 |
| Native Plugins | 6 |
| Official Integration Plugins | 5 |
| Tooling | 1 |
| 合计 | 48 |

`packages/contracts` 公开 30 个 Module / Service / Platform subpath。48 个目标 package 都有独立 manifest、TypeScript 配置、public entrypoint、README、build/typecheck 命令和迁移 Goal 标记。

所有目标 package 当前统一标为 `contract-only`。根 `@molis-ai/molis-work` 继续承载现有可工作的产品和发布兼容面；F2 没有宣称旧业务已经迁入。

## f2-boundary

结论：通过。

- `pnpm workspace:check`：`packageCount=48`、`uniquePackageNames=48`、`contractSubpaths=30`、`errors=[]`。
- 清单检查要求每个非 Contract package 只声明 `@molis-ai/molis-work-contracts: workspace:*`，Contract package 不依赖 implementation。
- 每个 public export 都从 `dist` 暴露；不存在指向其他 package 源码的 deep import。
- 48 个入口只导出 `packageDescriptor`，`capabilities` 为空；没有跨 owner Store、Provider 注册或复制旧业务规则。
- 代表性独立解析检查同时 import 了 `@molis-ai/molis-work-module-goals` 与 `@molis-ai/molis-work-contracts/modules/goals`，解析结果均为 `contract-only`。

F3 将在这份确定的包清单上增加持续运行的 import boundary 与 Contract conformance 自动门禁；F2 不提前实现 F3。

## f2-legacy-exit

结论：通过。

- F2 没有修改或搬运 `src/v1/coordinator.ts`、`src/v1/store.ts`、`src/web/render.ts`、`src/web/server.ts` 等 Huge Class。
- `git diff -- src/web/pty-client.ts tests/desktop-tui.test.ts` 也为空；完整回归中发现的旧 Feed 源码字符串断言与 F2 diff 无关。
- `workspace:check` 拒绝非 `contract-only` 状态、伪造 `registerProvider` / `createStore` 的入口以及额外 implementation 依赖。
- 旧实现来源与未来迁移 Goal 保留在每个 package README 和 [`docs/system/MIGRATION.md`](../../docs/system/MIGRATION.md)；没有形成第二个事实来源。

## f2-result

结论：通过。

| 验证 | 结果 |
| --- | --- |
| `pnpm -r list --depth -1 --json` | 49 个 workspace project、49 个唯一名称，其中 48 个目标 package + 1 个根兼容 package |
| `pnpm workspace:typecheck` | 48/48 package 通过 |
| `pnpm workspace:build` | 48/48 package 通过 |
| 构建产物检查 | 48 个 `dist/index.js` + 48 个 `dist/index.d.ts` |
| 独立 package 检查 | Contracts 与 Goals Module 分别 build/typecheck，并从正式 package 名称成功 import |
| `pnpm typecheck` | 根兼容 package 通过 |
| `pnpm build` | 根兼容 package 通过 |
| `pnpm pack --dry-run --json` | 通过；当前发布包仍只包含旧产品兼容面，没有误把私有 workspace package 打进根发布物 |
| F2 文档链接检查 | 99 个相关 Markdown 文件，缺失本地链接为 0 |
| `git diff --check` | 通过 |

完整 `pnpm test` 首次在沙箱内因本地端口、浏览器和 npm cache 权限产生环境失败；在本机权限下重跑后，只剩 1 条旧断言失败：`tests/desktop-tui.test.ts` 仍寻找旧的 `feed_item_id=${encodeURIComponent(feedItemId)}` 字符串，而未修改的 `src/web/pty-client.ts` 已使用 `URLSearchParams.set`。这不是 F2 产生的回归，不阻塞 package 底座验收；后续修复该旧测试时应按当前 Feed 行为单独处理，不能混入 F2。

## 文档与后续边界

- [`docs/SSOT-MATRIX.md`](../../docs/SSOT-MATRIX.md) 已把 48 个新 package 如实标为 `contract-only`。
- [`docs/system/MIGRATION.md`](../../docs/system/MIGRATION.md) 已记录根兼容 package、旧实现来源和后续迁移门。
- [`docs/cli-and-development.md`](../../docs/cli-and-development.md) 与英文版已补 workspace、全量和单 package 验证命令。
- 下一项 F3 负责自动依赖门禁；后续垂直 Goal 才迁移真实业务职责并拆除 Huge Class 的对应部分。
