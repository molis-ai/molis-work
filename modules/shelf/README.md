# 个人置物架

保存材料副本、任务工作区和生成结果，原件 Hash 不变。

包名：`@molis-ai/molis-work-module-shelf`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 把用户 Home 下的 `shelf/`（声明的条目是 `catalog.json`、`files/`、`jobs/`，见插件包的 `SHELF_OWNER_FILES`）以文件客户端（合同 `PluginOwnerFilesClient`）交给 `openShelfStore`；`admit` 经它写入材料副本，`runJob("extract_text")` 在 `jobs/<id>/input` 抽字并产出结果文件。读目录是同步的，改目录的方法都是异步的，调用方要 `await`。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/store.ts](src/store.ts) | 架子目录、进货、隐藏/删除、任务 |
| [src/copy-checks.ts](src/copy-checks.ts) | 副本的内容 Hash；任务开始前与每次写入前核对原件 |
| [src/extract.ts](src/extract.ts) | 提取结果的产品 Markdown 与文件名 |
| [src/pdf.ts](src/pdf.ts) | 示例 PDF 的生成与已知正文 |

## 接入与边界

不写项目数据库，不发布 Artifact。原件的路径只在平台那里：放入文件的请求经 `claimOriginal` 登记，Module 不存也不读路径；任务开始前和每次写入前经 `materials.readOriginal` 按 item 重新比对 Hash，原件不进入 Prompt 或 API 展示。

目录只读当前版本 2 和当前 item/job/clipboard 形状；错版或旧字段缺失明确拒绝并保留原文件，不在读取或后续保存时补齐历史字段。单项任务的现行 API 输入仍可使用 `item_id`。

网页材料通过 Host 注入的 `ShelfMaterialPorts.readWebsite` 读取，Module 只保存标题、链接和产品 Markdown。纯 Module 调用未注入时只保留链接，不隐式联网；抓取失败同样保留链接并注明没有正文。异步入库传递 `ShelfExecutionControl`，取消/撤权不入库，剪贴板在最终写入前重新核对来源。HTML 通用解析不由 Shelf 导出。

PDF/OCR 使用同一端口的 `extract`，原生可用性由 `imageTextAvailable` 被动提供。`admitFile` 异步准备 PDF 预览、复查执行权后入库；底层 `admit` 保存已授权的副本和已准备预览（异步，一次文件客户端写入），供示例及 Coding 文字成果使用。无提取端口的纯 Module 不自行解析 PDF 或启动进程。文件上限保持 32 MiB；OCR 语言选择、逐行“待确认”和提取不完整说明由本模块组织。

Host 明确接收固定成果时，可随 `admit` 提供 `artifact_source`；该来源保存在原 Shelf 目录记录中。相同项目、成果及版本再次接收返回已有副本，保留用户编辑；隐藏副本恢复显示，内容指纹冲突或副本文件缺失明确报错，不覆盖已有内容。来源本身不授予执行或项目写入权限。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（只用它的执行生命周期）。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-module-shelf typecheck
pnpm --filter @molis-ai/molis-work-module-shelf build
node scripts/run-tests.mjs tests/shelf-plugin.test.ts
```

## 开发要求

- 负责：个人置物架：材料副本、副本任务、Hash、提取结果组织与剪贴板历史。
- 不负责：项目 Goal 事实、Artifact 版本、桌面轮盘与热键。
- 公开入口：`@molis-ai/molis-work-module-shelf`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同入口 `@molis-ai/molis-work-contracts/platform/package`（包描述；Shelf 自己的合同是本包的 `@molis-ai/molis-work-module-shelf/contract`，`src/contract.ts`，PG-111 起由本包拥有，contracts 包里没有 Shelf 子路径）。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。方向：只依赖 contracts/modules、contracts/services 与 plugin-sdk（执行生命周期）；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 不写回原件；原路径只用于事后 Hash 校验，不进 Prompt 或 API。
  - 架子上的文件只经注入的文件客户端读写（没有 `node:fs` 的路径）；每个逻辑操作是一次 `files.write(run)`，`run` 同步完成、先读现行目录再改，所以同时开始的两个操作不会互相覆盖目录行。`events.jsonl` 按整文件替换追加一行。仍直接用 `node:fs` 的只有运行时探测（`runtimes.ts`）；原件 Hash 的核对经平台读原件（`copy-checks.ts` 的 `assertOriginsUntouched`），不碰路径；另外交给模型的冻结 `input/` 是一条真实目录路径（模型读它），Module 自己不用 fs 去碰它。
  - 不写项目数据库、不自动发布 Artifact；同项目、同成果、同版本再次接收返回已有副本并保留编辑。
  - 首次读取快照时，若 `seeded_sample` 为假且架子为空，放入一份「试用示例.pdf」（`ensureSample` → `seedSample`，真实可抽字的 PDF，由 `src/pdf.ts` 生成，经 `admit` 上架）。这是有意的首次使用引导，不是演示数据：任何材料入库或示例放入后 `seeded_sample` 为真，之后删除、隐藏都不会自动放回；用户可在设置的「使用指南」主动再放一份；不写项目库。
  - 自动任务只通过注入的 ShelfAiPorts，冻结 input 副本只读；领域模块不启动模型或终端进程。
  - CLI 能力探测只缓存完成的结果，超时或启动失败下次重新探测。
  - 任务使用 SDK 的执行生命周期；在途执行按 Home/root/job 隔离。异步等待后复查原 Action、任务和原件/副本 hash，再写输出、成果或失败记录。已取消/撤权的执行不补写失败；终止或重启后的旧 running 记录不自动重跑，也不继续阻塞材料。显式取消可以关闭原记录。
  - 失败都是 `ActionError`：码是 `shelf.<原因>`（`shelfErrors`），状态只由 kind 推出，模块没有错误类和状态表。带着模型运行回执的失败是 `ShelfFailure`（多一个 `execution`），任务记录据此留下回执；`isShelfFailure` 按码认自己的失败，不用 `instanceof`。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-module-shelf run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/shelf-plugin.test.ts tests/shelf-actions.test.ts tests/plugin-local-tools-service.test.ts tests/shelf-settings.test.ts tests/shelf-project-results-http.test.ts tests/shelf-jelly-cognia-images-error-model.test.ts tests/shelf-current-format.test.ts tests/shelf-owner-files.test.ts`
- 材料迁移额外验证：`node scripts/run-tests.mjs tests/shelf-material-extraction.test.ts tests/shelf-recipes.test.ts tests/shelf-settings.test.ts tests/material-extraction.test.ts`
- 相关手册：[docs/modules/shelf.md](../../docs/modules/shelf.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责说明](../../docs/modules/shelf.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)
- [Shelf 插件需求](../../specs/archive/shelf-plugin/spec.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/package` (the package descriptor); the Shelf contract itself is `@molis-ai/molis-work-module-shelf/contract`, owned by this package since PG-111 (`packages/contracts` carries no Shelf subpath)
- Migration Goals: `goal-reorg-f2`

## 被动发现与真实执行

`runtime()` / `snapshot()` 和 Agent 目录只问平台的本机工具服务（`services.localTools`，PG-112：九个引擎和额外目录写在插件的 Manifest `local_tools` 里），不读环境变量、不启动 CLI，也不再问 `--help`。人工终端与自动模型选择独立，`runJob()` 不探测或启动 CLI。没有这项服务（项目里的那一半）就是找不到。AI 可用性由 Host 的模型目录提供；未注入 AI 端口时明确不可用，本机提取仍可执行。

自动生成合同是 `ShelfAiPorts`，由插件的 Home 实例经 `services.model` 与 `services.materials` 实现（`plugins/native/shelf/src/ai.ts`），冻结副本经 Shelf 自己的 owner files 读；Module 拥有任务、输入 hash、结果和回执保存。模型端口返回后仍须通过原 Action 的 beforeEffect 并复查来源。AI 改动另跑 `tests/shelf-ai-host.test.ts` 与 `tests/shelf-job-runner.test.ts`。
