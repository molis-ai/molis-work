# Cognia

Status: `partial`. Workspace migration: `goal-reorg-f2`. Contract: `@molis-ai/molis-work-contracts/platform/plugin`.

Personal knowledge workspace for the current Molis Work Home. Import a local Obsidian, LLM Wiki or Markdown folder, preview the fixed snapshot, then explicitly commit. Browser folder uploads create an independent source; select an existing upload source to update it. Local path previews use a Host directory grant and record its grant ID as the source locator. Re-entering the same path obtains a new grant and currently creates a separate source; automatic source matching for that UI path remains unresolved. Source files are never changed. See [format compatibility](../../../specs/archive/cognia-plugin/compatibility.md).

The Home store is `cognia/cognia.db`. Materials preserve paths, original bytes, Markdown, frontmatter, common title/tags/aliases and every changed version. Source/path pairs are unique. Import previews expire after 30 minutes; cancelled previews do not add materials. Repeated commits and draft saves are idempotent. Conflicting previews require a fresh preview. Deleting source files does not delete imported materials.

Limits: 1,000 entries / 32 MB per batch, UTF-8 text up to 2 MB, attachments up to 8 MB. Hidden/cache directories and symlinks are skipped. Unsupported formats and read failures appear in the receipt. Images/PDF/audio/video are retained as attachments, without OCR or extraction. Downloads use attachment disposition and never execute HTML or SVG.

Search supports full text, domain and source filters. Internal links resolve within their own source; ambiguity stays visible. Source versions referenced by knowledge remain readable after reimport. Directly entered materials and domains are persisted in the same store.

AI is explicit. The Home Runtime supplies `services.model` from the current model-settings catalog and the shared Prologue runtime, with no tools and no filesystem access. The plugin owns its evidence and answer instructions, retains person overrides, and sets the existing 180-second timeout. Discovery reads provider/model labels without decrypting credentials or issuing a model request. Select 1–5 text materials for synthesis, or ask a question to retrieve up to 5 materials in the chosen domain. Context is capped at 100,000 characters; it is rejected instead of silently truncated. Inputs are marked untrusted; output must contain valid fixed-source citations. Generated drafts survive restart and enter knowledge only after **Save to knowledge base**. Missing configuration or model failure leaves local reading/import intact. Actual model usage follows the configured provider's billing.

Cognia declares 25 capabilities in `src/actions.ts` (22 knowledge-base actions plus the standard `cognia.search.entries`, `cognia.subject.read` and `cognia.files.entries`); its manifest derives both actions and permission declarations from that definition. The Home Host registers their handlers once without opening a project or UI. HTTP and onboarding material imports call the bound action service, and MCP clients use only granted action tools; the original store remains the only business/data owner.

`cognia:read` covers imported knowledge. Mutations require both read and `cognia:write`, because their results disclose records. `model:invoke` is additionally required for synthesis and questions. `cognia:read-local-files` separately authorizes directory scans and local directory previews; upload previews need no filesystem access. The declared permissions never grant themselves to callers. Directory import declares its scan/preview dependencies in the same catalog.

Authorized MCP clients use individual registered capabilities, including writes, through the same handlers. Download actions return original bytes as Base64, filename and MIME; HTTP preserves inert attachment delivery. Existing HTTP mutations retain the Host same-origin/control-token gate. Production client grant management and general workflow mapping remain part of the system migration.

Synthesis accepts either `material_refs` (each containing `id` and positive `revision`) or legacy `material_ids` (current version when invoked), never both. The UI sends the displayed revisions, including historical citations. AI reads immutable version snapshots in a short store operation, releases the store while awaiting Prologue, and persists a validated draft in another short transaction. Edits during generation do not change its evidence; deleting the target domain rejects draft persistence and leaves the materials available for retry. Discovery inspects model/connection metadata without decrypting credentials. Execution resolves the selected credential and revalidates the model/connection before and after the run. Cancellation, model failure and invalid citations do not save drafts.

The bundled Prologue SDK accepts HTTPS and explicitly authorized loopback HTTP model endpoints through the same Run/Host path. Discovery never starts a request or decrypts credentials. A disabled model or missing connection makes generation unavailable while local reading/import remain usable. Tests exercise the packed SDK against controlled HTTP and HTTPS providers for generation/cancellation, and the actual desktop/narrow UI for review, explicit save and disablement. These controlled responses do not establish external commercial model quality.

Verification:

```sh
pnpm --filter @molis-ai/molis-work-plugin-cognia typecheck
node scripts/run-tests.mjs tests/cognia-*.test.ts tests/context-onboarding.test.ts
pnpm boundary:check
```

No cloud sync, background watching, bidirectional sync, proprietary database migration, graph view, Dataview execution, block-reference reconstruction, or PDF/OCR extraction is included.

## Directory preview route repair (2026-10-23)

This repair restores the existing import journey in [the Cognia spec](../../../specs/archive/cognia-plugin/spec.md): enter a local directory, authorize it through the Host, review the fixed preview, and explicitly import. The client must use the Manifest's `/library/import/preview` route, whose handler already selects the directory action when `path` is present. It retains the Host-issued `grant_id`, the relative `path`, and the bound action service; no route, permission, chooser, storage identity or import policy is added.

Acceptance uses the actual desktop and narrow-screen UI for preview, explicit commit, review and fixed-version citations, plus the existing directory-authority, cancellation and source-isolation tests. The concurrent-import fixture must identify the existing source explicitly when updating it. This slice does not claim that selecting the same path with a new directory grant automatically matches the previous source; directory source identity and a native chooser are outside this route repair. Source files remain untouched, cancelled previews add no materials, and denied calls retain the existing refusal behavior.

## 开发要求

- 负责：个人知识的导入、阅读与有出处的综合。
- 不负责：修改来源库、项目事实、第二个运行时。
- 公开入口：`@molis-ai/molis-work-plugin-cognia`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-plugin-sdk`、`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - Home 监督器只装一个 Cognia；每个项目都读同一个库。`COGNIA_DATABASE` 保留原基线 1，读经 Runtime 库端口，写经 `database.transaction(caller.beforeEffect, …)`。停止、撤权或取消后不能保存晚到草稿。
  - 页面用共同请求客户端调用 `/api/plugins/io.molis.work.cognia/library`；仅导入预览显式声明 45,000,000 字节，容纳 32 MB 原始文件的 Base64 JSON。
  - 目录扫描返回后，建立预览前复查原调用授权、取消及执行资格；嵌套扫描/预览沿共享动作控制传递原调用身份。返回列表、移出当前材料或删除其来源时清空本页当前对象，固定历史引用仍由资料 owner 读取。
  - 不改原文件；删除源文件不删除已导入的材料，取消预览不添加材料。
  - 提交后的预览只留回执（重复提交返回它），不再留整批文件；删除资料会让采纳过它的草稿回到未采纳，可再次采纳；已固定版本仍按草稿显示来源引用（草稿记着它采纳过的资料）。
  - 综合输出必须带有效的固定来源引用；取消、模型失败或引用无效时不保存草稿；草稿只有「存入知识库」后才进入知识。
  - 下载用附件方式，从不执行 HTML 或 SVG；发现能力不发起请求、不解密凭据。
  - HTTP、MCP 动作工具与导入都经绑定的动作服务，原 Store 是唯一数据 owner。
  - 失败都是 `ActionError`：码是 `cognia.<原因>`（`cogniaErrors`）；状态只由 kind 推出，没有错误类和状态表。原来码跟着状态走（404、409、499 各有一个码，其余都叫 `cognia.invalid`），现在模型没配置是 `cognia.model_unavailable`（503），模型没给出可用结果是 `cognia.model_invalid`（502），材料太大是 `cognia.too_large`（413）。目录扫描里只有 kind 为 `too_large` 的失败会中断整批，别的失败记成那个文件的跳过原因。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-plugin-cognia run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/cognia-actions.test.ts tests/cognia-store.test.ts tests/cognia-ai.test.ts tests/cognia-http.test.ts tests/cognia-prologue.test.ts tests/cognia-runtime.test.ts tests/cognia-workbench.test.ts tests/cognia-client-bundle.test.ts tests/shelf-jelly-cognia-images-error-model.test.ts`
- 授权等待及可见对象定向回归：`node scripts/run-tests.mjs tests/content-owner-regressions.test.ts tests/content-context-regressions.e2e.test.ts`（浏览器文件需要本机 Chrome；owner 用例的授权是受控策略回调）。
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/model-ready-surfaces.e2e.test.ts`（页面在没有模型时显示「没有模型」，模型设置页宣布第一个模型（`molis-work:model-ready`）后它要重读；这个文件每个页面一条用例）。
- 相关手册：[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)、[specs/archive/cognia-plugin/spec.md](../../../specs/archive/cognia-plugin/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

目录导入：可以上传目录文件；未上传时，「预览导入」打开宿主系统目录选择器。界面不能提交绝对路径来取得授权。系统选择后得到的 grant 只供当前插件激活实例、当前项目及调用者使用，取消、撤权、重启和项目删除使其失效（SYS-15）。

页面客户端是 `src/browser/` 的 TypeScript（`tsconfig.browser.json` 类型检查），构建时由 esbuild 打成 `dist/cognia-client.js`，`src/client.ts` 读取它；页面上的字是 `src/messages.ts` 里的稳定键 `cognia.<区域>.<名称>`（`registration.messages`），请求只经共同的 `molisWorkRequest`，插件路径取自 `host.pluginRoute`，不直接 `fetch`、不写插件 id。`src/en.ts` 只留 33 个宿主还按中文原文翻译的词（Cognia 服务端抛出的错误与模型提示、导入预览里文件被跳过的原因，页面把收到的原文交给 `translate`），BL-457；页面自己的词不在这里。
