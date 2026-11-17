# `@molis-ai/molis-work-service-sessions`

Home 级外部 AI 开发工具会话横向服务：管理允许读取的工具与目录范围、每个项目的 AI 读取许可、渐进式发现与索引、九级项目归属与 AI 建议、对话原文按需流式读取，以及系统搜索摘要索引。

## 开发要求

- 负责：外部会话的读取范围（`session_read_scopes`）、逐项目 AI 读取许可（`session_project_ai_reads`）、索引与来源进度（`external_sessions` / `session_sources`）、九级归属规则与单条人工决定（`session_directories` / `session_attributions`）、目录组 AI 归属建议缓存（`session_suggestions`），以及各外部工具只读适配（`src/adapters/`）。
- 不负责：原生工具记录写入或恢复/发送控制、账号凭据存储（归 `connector-host`）、项目目录事实（归 `modules/projects`）、模型直接调用（由宿主经 `horizontal/agent-host` 注入 `SessionAttributionSuggester`）。
- 公开入口：`@molis-ai/molis-work-service-sessions`（`SessionsService`、`EXTERNAL_SESSIONS_HOME_STORE`、`sessionsProjectData`、`identifySessionDirectory` 与端口类型；`SessionsStore` 不对外导出）。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`、`@molis-ai/molis-work-storage`。
- 不变量：
  - 原文绝不落入 `external-sessions.db` 或系统全文索引；系统搜索仅索引标题、工具名与目录（`S-sessions-untrusted-text`）。
  - 所有本地文件读取经宿主根目录端口并限制在获准的数据根内，所有子进程只跑 `EXTERNAL_TOOLS` 声明的只读命令，认仓库只读 `.git` / `commondir` / `gitdir` 三个文件（`S-sessions-read-roots`、`S-sessions-read-only-commands`、`S-sessions-git-files-only`）。
  - 外部异步读取、工具内搜索、后台发现与 AI 建议在落库或返回前必须在同步项目快照内复核当前范围与项目许可（`S-sessions-recheck-before-return`）。
  - 读取范围、项目 AI 许可与单条归属决定只受 `user` 调用修改；非本人调用必须通过项目 AI 许可且只看见归属当前项目的 `confirmed` / `automatic` 会话摘要（`S-sessions-person-decides`）。
- 改动后必跑：`node scripts/run-tests.mjs --jobs 1 tests/action-sessions-contract.test.ts tests/sessions-service.test.ts tests/sessions-adapters.test.ts tests/security-invariants-external-sessions.test.ts`
- 相关手册：`specs/sessions-rebuild/spec.md`、`specs/sessions-rebuild/contract-design.md`、`docs/horizontal/sessions.md`、`docs/system/SECURITY-INVARIANTS.md`。
