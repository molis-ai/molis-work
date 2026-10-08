# Cognia

Status: `partial`. Workspace migration: `goal-reorg-f2`. Contract: `@molis-ai/molis-work-contracts/platform/plugin`.

Personal knowledge workspace for the current Molis Work Home. Import a local Obsidian, LLM Wiki or Markdown folder, preview the fixed snapshot, then explicitly commit. Browser folder uploads create an independent source; select an existing upload source to update it. Local paths use the canonical directory as source identity. Source files are never changed. See [format compatibility](../../../specs/archive/cognia-plugin/compatibility.md).

The Home store is `cognia/cognia.db`. Materials preserve paths, original bytes, Markdown, frontmatter, common title/tags/aliases and every changed version. Source/path pairs are unique. Import previews expire after 30 minutes; cancelled previews do not add materials. Repeated commits and draft saves are idempotent. Conflicting previews require a fresh preview. Deleting source files does not delete imported materials.

Limits: 1,000 entries / 32 MB per batch, UTF-8 text up to 2 MB, attachments up to 8 MB. Hidden/cache directories and symlinks are skipped. Unsupported formats and read failures appear in the receipt. Images/PDF/audio/video are retained as attachments, without OCR or extraction. Downloads use attachment disposition and never execute HTML or SVG.

Search supports full text, domain and source filters. Internal links resolve within their own source; ambiguity stays visible. Source versions referenced by knowledge remain readable after reimport. Directly entered materials and domains are persisted in the same store.

AI is explicit. The Host composes `createCogniaProloguePort` using the current Home model-settings catalog and Prologue, with no tools and no filesystem access. No environment-only model adapter is used in production. Select 1–5 text materials for synthesis, or ask a question to retrieve up to 5 materials in the chosen domain. Context is capped at 100,000 characters; it is rejected instead of silently truncated. Inputs are marked untrusted; output must contain valid fixed-source citations. Generated drafts survive restart and enter knowledge only after **Save to knowledge base**. Missing configuration or model failure leaves local reading/import intact. Actual model usage follows the configured provider's billing.

Cognia declares 25 capabilities in `src/actions.ts` (22 knowledge-base actions plus the standard `cognia.search.entries`, `cognia.subject.read` and `cognia.files.entries`); its manifest derives both actions and permission declarations from that definition. The Home Host registers their handlers once without opening a project or UI. HTTP and onboarding material imports call the bound action service, and MCP clients use only granted action tools; the original store remains the only business/data owner.

`cognia:read` covers imported knowledge. Mutations require both read and `cognia:write`, because their results disclose records. `model:invoke` is additionally required for synthesis and questions. `cognia:read-local-files` separately authorizes directory scans and local directory previews; upload previews need no filesystem access. The declared permissions never grant themselves to callers. Directory import declares its scan/preview dependencies in the same catalog.

Authorized MCP clients use individual registered capabilities, including writes, through the same handlers. Download actions return original bytes as Base64, filename and MIME; HTTP preserves inert attachment delivery. Existing HTTP mutations retain the Host same-origin/control-token gate. Production client grant management and general workflow mapping remain part of the system migration.

Synthesis accepts either `material_refs` (each containing `id` and positive `revision`) or legacy `material_ids` (current version when invoked), never both. The UI sends the displayed revisions, including historical citations. AI reads immutable version snapshots in a short store operation, releases the store while awaiting Prologue, and persists a validated draft in another short transaction. Edits during generation do not change its evidence; deleting the target domain rejects draft persistence and leaves the materials available for retry. Discovery inspects model/connection metadata without decrypting credentials. Execution resolves the selected credential and revalidates the model/connection before and after the run. Cancellation, model failure and invalid citations do not save drafts.

The bundled Prologue SDK accepts HTTPS and explicitly authorized loopback HTTP model endpoints through the same Run/Host path. Discovery never starts a request or decrypts credentials. A disabled model or missing connection makes generation unavailable while local reading/import remain usable. Tests exercise the packed SDK against controlled HTTP and HTTPS providers for generation/cancellation, and the actual desktop/narrow UI for review, explicit save and disablement. These controlled responses do not establish external commercial model quality.

Verification:

```sh
pnpm --filter @molis-ai/molis-work-plugin-cognia typecheck
node --import tsx --test --test-concurrency=1 tests/cognia-*.test.ts tests/context-onboarding.test.ts
pnpm boundary:check
```

No cloud sync, background watching, bidirectional sync, proprietary database migration, graph view, Dataview execution, block-reference reconstruction, or PDF/OCR extraction is included.

## 开发要求

- 负责：个人知识的导入、阅读与有出处的综合。
- 不负责：修改来源库、项目事实、第二个运行时。
- 公开入口：`@molis-ai/molis-work-plugin-cognia`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 不改原文件；删除源文件不删除已导入的材料，取消预览不添加材料。
  - 提交后的预览只留回执（重复提交返回它），不再留整批文件；删除资料会让采纳过它的草稿回到未采纳，可再次采纳；已固定版本仍按草稿显示来源引用（草稿记着它采纳过的资料）。
  - 综合输出必须带有效的固定来源引用；取消、模型失败或引用无效时不保存草稿；草稿只有「存入知识库」后才进入知识。
  - 下载用附件方式，从不执行 HTML 或 SVG；发现能力不发起请求、不解密凭据。
  - HTTP、MCP 动作工具与导入都经绑定的动作服务，原 Store 是唯一数据 owner。
- 改动后必跑：`node scripts/run-tests.mjs tests/cognia-actions.test.ts tests/cognia-store.test.ts tests/cognia-ai.test.ts tests/cognia-http.test.ts tests/cognia-prologue.test.ts`
- 相关手册：[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)、[specs/archive/cognia-plugin/spec.md](../../../specs/archive/cognia-plugin/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
