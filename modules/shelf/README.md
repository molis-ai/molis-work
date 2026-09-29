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
| [src/extract.ts](src/extract.ts) | 提取结果的产品 Markdown 与文件名 |
| [src/pdf.ts](src/pdf.ts) | 示例 PDF 的生成与已知正文 |

## 接入与边界

不写项目数据库，不发布 Artifact。原路径只用于事后 Hash 校验，不进入 Prompt 或 API 展示。

网页材料通过 Host 注入的 `ShelfMaterialPorts.readWebsite` 读取，Module 只保存标题、链接和产品 Markdown。纯 Module 调用未注入时只保留链接，不隐式联网；抓取失败同样保留链接并注明没有正文。异步入库传递 `ShelfExecutionControl`，取消/撤权不入库，剪贴板在最终同步写入前重新核对来源。HTML 通用解析不由 Shelf 导出。

PDF/OCR 使用同一端口的 `extract`，原生可用性由 `imageTextAvailable` 被动提供。`admitFile` 异步准备 PDF 预览、复查执行权后入库；底层 `admit` 同步保存已授权的副本和已准备预览，供示例及 Coding 文字成果使用。无提取端口的纯 Module 不自行解析 PDF 或启动进程。文件上限保持 32 MiB；OCR 语言选择、逐行“待确认”和提取不完整说明由本模块组织。

Host 明确接收固定成果时，可随 `admit` 提供 `artifact_source`；该来源保存在原 Shelf 目录记录中。相同项目、成果及版本再次接收返回已有副本，保留用户编辑；隐藏副本恢复显示，内容指纹冲突或副本文件缺失明确报错，不覆盖已有内容。来源本身不授予执行或项目写入权限。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-kernel`。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-module-shelf typecheck
pnpm --filter @molis-ai/molis-work-module-shelf build
node --import tsx --test --test-concurrency=1 tests/shelf-plugin.test.ts
```

## 开发要求

- 负责：个人置物架：材料副本、副本任务、Hash、提取结果组织与剪贴板历史。
- 不负责：项目 Goal 事实、Artifact 版本、桌面轮盘与热键。
- 公开入口：`@molis-ai/molis-work-module-shelf`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/shelf`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-kernel`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 不写回原件；原路径只用于事后 Hash 校验，不进 Prompt 或 API。
  - 不写项目数据库、不自动发布 Artifact；同项目、同成果、同版本再次接收返回已有副本并保留编辑。
  - 任务运行时 `input/` 只读，`work/` 是 Agent 的工作目录。
  - CLI 能力探测只缓存完成的结果，超时或启动失败下次重新探测。
  - 任务使用 Kernel 执行生命周期；在途执行按 Home/root/job 隔离。异步等待后复查原 Action、任务和原件/副本 hash，再写输出、成果或失败记录。已取消/撤权的执行不补写失败；终止或重启后的旧 running 记录不自动重跑，也不继续阻塞材料。显式取消可以关闭原记录。
- 改动后必跑：`node scripts/run-tests.mjs tests/shelf-plugin.test.ts tests/shelf-actions.test.ts tests/shelf-cli-probe.test.ts tests/shelf-project-results-http.test.ts`
- 材料迁移额外验证：`node scripts/run-tests.mjs tests/shelf-material-extraction.test.ts tests/shelf-recipes.test.ts tests/shelf-settings.test.ts tests/material-extraction.test.ts`
- 相关手册：[docs/modules/shelf.md](../../docs/modules/shelf.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责说明](../../docs/modules/shelf.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)
- [Shelf 插件需求](../../specs/shelf-plugin/spec.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/shelf`
- Migration Goals: `goal-reorg-f2`

## 被动发现与真实执行

`runtime()` / `snapshot()` 和 Agent 目录只检查可执行文件，不启动 `--help`。找到程序后 `capability_pending: true`、`can_run_job: false`，动作可以进入确认界面但不宣称能力或登录已验证。`runJob()` 仅在需要 Agent 时探测所选程序，继续按原规则校验任务入口与隔离；本机提取不探测 Agent。显式 `pathEnvironment` 是完整搜索范围，默认发现才包含常用安装目录。
