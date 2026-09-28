# F1 架构 SSOT 验证记录

日期：2026-09-01  
Goal：`goal-reorg-f1`  
Contract revision：1

## 验收结论

| Criterion | 结果 | 证据 |
| --- | --- | --- |
| `f1-boundary` | 通过 | `docs/system/PACKAGE-BOUNDARIES.md` 定义唯一 owner、public entrypoint、禁止 deep import/跨 Store/App 写库和 package 建立门；16 个 Module 与 4 个 Horizontal Service 分别有 owner 文档 |
| `f1-legacy-exit` | 通过 | `docs/system/HUGE-CLASS-MIGRATION.md` 覆盖当前 18 个超过 1,000 行的源码和 5 个大型测试文件，职责映射到唯一主要迁移 Goal；本次未移动业务代码 |
| `f1-result` | 通过 | `docs/SSOT-MATRIX.md` 覆盖 48 个目标 package，以及 Module、Plugin、App、入口、发布面、状态与迁移 Goal |

## 自动检查

### 内部链接

对 41 份本次权威/导航文档中的相对 Markdown 链接做本地路径检查：

```text
files: 42
local_links_checked: 90
broken: 0
```

### 包与文档覆盖

把目标包清单、Module/Horizontal 文档和当前大文件清单与 SSOT 对账：

```text
target_packages: 48
missing_packages: 0
module_docs: 16
horizontal_docs: 4
large_source_files: 18
large_test_files: 5
uncovered_large_files: 0
```

### 一致性与构建

```text
stale architecture phrases: 0
unexpected trailing whitespace: 0
historical architecture draft marked superseded: true
git diff --check: passed
pnpm typecheck: passed
```

未运行完整 `pnpm test`：F1 只修改架构和开发文档，没有改变 TypeScript、Runtime、数据库或产品行为；完整行为测试留给实际迁移切片，当前用链接、清单、边界和类型检查作与风险匹配的验证。

## 变更边界

- 修改：架构 Spec 状态与冲突文字、SSOT/Module/Horizontal/Platform/System 文档、README/开发导航、旧草案 superseded 标记。
- 未修改：`src/`、`tests/`、`package.json`、workspace、数据库、安装发布脚本和业务行为。
- 下一项：`goal-reorg-f2` 根据本 SSOT 创建完整 Monorepo workspace/package 树；无实现来源的 package 只建立 `contract-only` 边界。
