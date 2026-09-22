# 交付物浏览与 Plugin 客户端

把 Artifact 事实展示为项目可引用、可浏览、可导出的交付物，并给 Plugin 提供受授权约束的读写客户端。

## 从文档工具导入

在项目的 Artifacts 目录点击「导入文档」，选择来源、粘贴文档链接或选择文件，然后点击导入。成功后可打开精确版本阅读正文、查看来源并导出版本 JSON。在线来源复用「设置 → 连接器」中的凭据，不需要在导入页粘贴密钥。

| 来源 | 支持内容 | 连接要求 |
| --- | --- | --- |
| Notion | 单个页面的 Markdown 正文 | Notion 连接有读取权限，且页面已共享给该连接 |
| 飞书 / Lark | 新版 docx 文档、指向 docx 的知识库节点，纯文本正文 | 各自区域的自建应用 `app_id:app_secret`；文档读取及共享权限；知识库另需节点读取权限 |
| Google Docs | 单个 Google 文档，纯文本正文 | Google Drive 访问令牌，含 `drive.readonly` 或适用于该文件的 `drive.file` 权限 |
| 导出文件 | `.md`、`.markdown`、`.txt`、`.html`、`.htm`，UTF-8，最多 2 MB | 无需连接；适用于其他文档工具导出的这些格式 |

每次导入都是当前正文的个人快照。在线同源文档内容变化时新增版本，旧版本和精确引用保留；相同快照复用当前可用版本。本地文件按文件名和内容标识，同名但内容不同的文件保存成独立 Artifact，避免误覆盖。HTML 提取为 Markdown 文本，同时在版本数据中保留原 HTML。

当前不递归导入整个空间、数据库、子页面或附件文件，不自动同步和回写。Google Docs / 飞书 / Lark 的排版、图片、附件、评论及嵌入内容不承诺保留；Notion 的附件链接可能到期。PDF、DOCX 和 ZIP 请先转换为支持的格式。空正文、超限、权限错误和 Notion 明确返回的截断结果不会产生成功 Artifact。

实现分工：本插件编排导入并通过 `ArtifactsApplicationApi` 注册 `io.molis.work.document` v1；官方 catalog integration 只读取文档工具 API；Local Host 读取凭据、校验本地控制请求并注入端口。没有新增存储表、后台同步任务或跨插件私有存储。

官方接口依据：[Notion 页面 Markdown](https://developers.notion.com/reference/retrieve-page-markdown)、[飞书获取文档纯文本](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content)、[Google Drive 文档导出](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export)。

包名：`@molis-ai/molis-work-plugin-artifacts`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

readArtifactBrowser 读取浏览模型，UI contribution 渲染目录/版本；openArtifactProjectReference 解析项目引用。createPluginArtifactClient 在 Host context 下调用 Artifact 公开服务，publish/read 使用同一权限边界。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/browser.ts](src/browser.ts) | 浏览、版本与导出 |
| [src/project-reference.ts](src/project-reference.ts) | 项目引用打开 |
| [src/plugin-client.ts](src/plugin-client.ts) | Plugin Artifact 客户端 |
| [src/goal-context.ts](src/goal-context.ts) | 目标中的 Artifact 引用 |

可对照现有调用方 [apps/local-host/src/plugin-executor.ts](../../../apps/local-host/src/plugin-executor.ts) 阅读装配方式。

## 接入与边界

不复制 Artifact Store，不依赖生产者/消费者 Plugin 实现。引用精确版本；自定义 payload 没有兼容 renderer 时保留可读取的数据表达。Host 可提供已净化的业务正文及来源导航；当前已装配 Coding 固定报告与固定变更，校验类型、来源签名、原任务身份和精确版本后使用原 Markdown 或逐条提案正文；变更沿用 Diff 渲染器显示原前后文本、批准决定及保存时执行状态，不读取当前会话或磁盘重新拼接。原生折叠按修改序号区分同一路径的多次提案，返回入口打开 Coding 原固定成果并可继续原任务。归档仍可历史阅读，内容不可用或来源不符则保留通用信息，不提供业务预览。标题优先使用 payload，缺失时使用 metadata.title，最后显示 Artifact ID；不改变原版本。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-artifacts typecheck
pnpm --filter @molis-ai/molis-work-plugin-artifacts build
```

已有行为示例与回归：[artifact-browser.test.ts](../../../tests/artifact-browser.test.ts)、[plugin-artifact-client.test.ts](../../../tests/plugin-artifact-client.test.ts)。完成上述构建后运行：

```bash
pnpm test:run tests/artifact-browser.test.ts tests/plugin-artifact-client.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

文档导入回归：

```bash
node --import tsx --test --test-concurrency=1 tests/artifact-document-import.test.ts tests/document-import-providers.test.ts tests/catalog-connectors.test.ts tests/artifact-browser.test.ts tests/artifacts-module.test.ts tests/plugin-artifact-client.test.ts
```

2026-09-22 本地验证：全构建、相关类型检查与上述回归通过；浏览器使用中文 Markdown 文件走通主工作台入口、文件选择、保存、正文读取、重复导入复用、服务重启恢复和缺少凭据后的恢复操作，矮窗口可滚动到提交按钮。在线文档 API 只核对了官方文档并通过模拟响应测试；真实 Notion、飞书、Lark、Google 账号联调及用户验收仍为 `UNVERIFIED`。正文当前是保留换行的安全文本预览，不提供完整 Markdown 富文本排版。

全仓 `boundary:check` 仍被基线的 `plugins/native/pages` 依赖清单不一致阻挡：其 `package.json` 已包含 highlight.js、lowlight、prosemirror-dropcursor 与 prosemirror-gapcursor，但 `scripts/workspace-packages.mjs` 的既有清单未同步；本次没有修改这两个文件，也没有新增依赖或边界豁免。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/artifacts.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ar3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
