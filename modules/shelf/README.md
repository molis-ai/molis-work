# 个人置物架

保存材料副本、任务工作区和生成结果，原件 Hash 不变。

包名：`@molis-ai/molis-work-module-shelf`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 打开用户 Home 下的 `shelf/`；`admit` 写入材料副本，`runJob("extract_text")` 在 `Jobs/<id>/work` 抽字并产出结果文件。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/store.ts](src/store.ts) | 架子目录、进货、隐藏/删除、任务 |
| [src/extract.ts](src/extract.ts) | 本机文字提取 |
| [src/pdf.ts](src/pdf.ts) | 示例 PDF 与可选中文字抽取 |

## 接入与边界

不写项目数据库，不发布 Artifact。原路径只用于事后 Hash 校验，不进入 Prompt 或 API 展示。

Host 明确接收固定成果时，可随 `admit` 提供 `artifact_source`；该来源保存在原 Shelf 目录记录中。相同项目、成果及版本再次接收返回已有副本，保留用户编辑；隐藏副本恢复显示，内容指纹冲突或副本文件缺失明确报错，不覆盖已有内容。来源本身不授予执行或项目写入权限。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-module-shelf typecheck
pnpm --filter @molis-ai/molis-work-module-shelf build
node --import tsx --test --test-concurrency=1 tests/shelf-plugin.test.ts
```

## 进一步阅读

- [职责说明](../../docs/modules/shelf.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)
- [Shelf 插件需求](../../specs/shelf-plugin/spec.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/shelf`
- Migration Goals: `goal-reorg-f2`

## 被动发现与真实执行

`runtime()` / `snapshot()` 和 Agent 目录只检查可执行文件，不启动 `--help`。找到程序后 `capability_pending: true`、`can_run_job: false`，动作可以进入确认界面但不宣称能力或登录已验证。`runJob()` 仅在需要 Agent 时探测所选程序，继续按原规则校验任务入口与隔离；本机提取不探测 Agent。显式 `pathEnvironment` 是完整搜索范围，默认发现才包含常用安装目录。
