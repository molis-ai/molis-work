# F3 Package 边界与 Contract 自动门禁验证

Goal：`goal-reorg-f3`  
验证日期：2026-09-02  
完成等级：功能可用（本地与 CI 的新 package 架构门禁真实工作；不代表旧业务已经迁移）

## f3-boundary

F3 已把 F1 的关键依赖规则变成同一套可复用检查：

- `packages/test-kit/src/boundaries.ts` 是纯规则层，只接收 package/import 信息并返回明确违规，不读文件、不连数据库、不包含业务判断。
- `scripts/check-package-boundaries.mjs` 扫描 48 个目标 package 的源码 import、manifest dependency、public export、Contract 清单、README 状态和依赖环。
- 新 package 回头 import 旧根 `@molis-ai/molis-work`，或用相对路径逃出自己的 package，也会失败，防止“目录搬了、实现还偷用旧内部代码”的伪迁移。
- 根命令 `boundary:test`、`boundary:check` 和 `workspace:verify` 分别验证规则、扫描真实仓库、执行完整 package 门禁。
- `.github/workflows/ci.yml` 在 pull request 与 `main` push 上运行 `pnpm workspace:verify`；legacy 产品全量 CI 仍保持原有暂停边界。

真实仓库扫描结果：

```text
packageCount=48
sourceFileCount=79
importCount=31
dependencyEdgeCount=47
contractSubpaths=30
errors=[]
```

## f3-legacy-exit

F3 没有把旧业务实现复制进新 package，也没有提前拆分其他 Goal 负责的 Store、Module 或 UI。

- `git diff -- src tests` 为空；现有产品代码和旧回归测试没有被本 Goal 修改。
- `packages/test-kit` 只新增无业务语义的 boundary policy，因此从 `contract-only` 如实升级为 `partial`；其余 47 个目标 package 仍是 `contract-only`。
- `tooling/boundaries/compatibility-allowlist.json` 逐项登记根 public facade 和 18 个现有超过 1,000 行的旧文件；每项都有迁移 Goal、移除 owner 和可判断的移除条件。
- 门禁会拒绝新的未登记 Huge File；新 workspace package 永远不能通过这份名单豁免 import 规则。
- Huge Class 的业务职责仍由 `docs/system/HUGE-CLASS-MIGRATION.md` 中已经确认的后续 Goal 拆分，F3 只负责阻止继续恶化和绕过边界。

## f3-result

同一个 `evaluateImportBoundary` 同时被仓库扫描器和 9 个规则测试使用。失败样例已经证明它会拒绝：

1. 未公开 subpath 的 deep import；
2. 一个 Module import 另一个 Module 的 implementation/Store；
3. 一个 Native/Integration Plugin import 另一个 Plugin implementation；
4. App import `better-sqlite3`、`node:sqlite` 等数据库实现；
5. 新 package import 旧根实现或用相对路径逃出 package；
6. 生产 package 依赖内部 `test-kit`、未声明 workspace dependency、Contract 反向依赖实现与 package 依赖环。

公开的 `@molis-ai/molis-work-contracts/<owner>` subpath 有正向样例，证明门禁不是简单禁止 package 之间协作，而是要求从明确的公开边界协作。

## 验证记录

| 验证 | 结果 | 说明 |
| --- | --- | --- |
| `CI=true pnpm workspace:verify` | 通过 | 9 个边界测试、真实仓库扫描、48 package typecheck/build 全部通过 |
| `CI=true pnpm typecheck` | 通过 | 旧根产品类型检查通过 |
| `CI=true pnpm build` | 通过 | 旧根产品构建通过 |
| `pnpm pack --dry-run --json` | 通过 | 当前 legacy 发布内容仍可生成，未意外包含新 workspace 实现 |
| `git diff --check` | 通过 | 无 whitespace 错误 |
| `CI=true pnpm test` | 未全绿（已有基线问题） | 全量回归仅观察到既有 `tests/desktop-tui.test.ts:974` 文本断言失败：断言仍期待手工 `encodeURIComponent` 字符串，而未改动的 `src/web/pty-client.ts` 已使用 `URLSearchParams.set`；与 F3 无关，本 Goal 不扩大范围修改 |

## 结论

F3 的三个承诺均已完成：自动 package/Contract 门禁、import boundary 检查、workspace build/typecheck 编排。后续迁移 Goal 一旦 deep import、跨 owner 读 Store、让 Plugin 互相依赖、让 App 直碰数据库，开发者本地和 CI 都会在合并前直接看到具体文件与违规原因。
