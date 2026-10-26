# Forms 问卷入口

本机问卷：建题、预览填写、看结果。数据在 `{home}/form/form.db`。

包名：`@molis-ai/molis-work-plugin-form`。

插件在 `src/actions.ts` 声明列表、读取、新建、编辑、删除、本地加题、AI 生成题目、标记已发布、停止收集、提交与导入答卷、读取与导出结果、导出填写页、存成成果等能力。插件经 Plugin Runtime 运行，每个项目一个实例（`src/plugin.ts` 的 `createFormPlugin`，宿主在 `apps/local-host/src/project-plugins.ts` 的监督器条目里启动它，问卷库是条目声明的 `form` 库）；页面走 Manifest 声明的路由（项目下的 `/api/plugins/io.molis.work.form/forms…`，每条只把请求转成同名动作，带内容的路由读到 1 MB），MCP 只经授权的动作工具，项目、调用者及权限由 Host 注入。

页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/form-client.js`（banner/footer 包成工作台要的 `(host) => {…}` 工厂，`--minify`）；`src/client.ts` 的 `FORM_CLIENT_FACTORY_SCRIPT` 只读这个包。页面状态在一个 `FormPage` 对象里（`page.ts`），按钮是 `commands.ts` 里按顺序匹配的命令表；请求只经工作台的 `molisWorkRequest`（`request.ts`）。客户端宿主从公共 `UiPluginClientHost` 取实际使用的能力，插件路由由 `host.pluginRoute` 按 Manifest 身份与当前项目提供；请求的全局声明通过 Plugin SDK 的类型导入取得。

页面上的字是稳定键（`form.<区域>.<名称>`），中英文都在 `src/messages.ts`，登记在 `registration.ts` 的 `messages`，不经工作台的 `i18n/en.ts` import。`src/en.ts` 的 `FORM_EN` 只留 51 条宿主还按中文原文翻译的词（服务端标签与错误、导出填写页文件里的来源词、别的主人在查的词，BL-462）；`tests/form-client-bundle.test.ts` 用真实翻译扫描器钉住键与词的对应，页面里没有动态翻译。

“按题目加题”只做本地追加；“AI 生成题目”（`form.questions.draft`）显式使用系统文字模型和连接，另需 `model:invoke`：要求说得不够时先返回 `needs_input` 和几道选择题（宿主把它画成共享问卷卡），回答按问过的题检查后再拟题，只追问一次；问过的题只存在插件进程里（至多 32 组、一天）。缺模型禁用 AI，保留本地操作。模型等待期间问卷被编辑、删除，或调用取消、连接撤销时不追加过期结果。

“标记已发布”只保存本机状态和稳定 `share_id`，不产生外网填写链接。“存成 Artifact”保存问卷内容，不包含答卷；固定下来的版本归本机的人，固定它的行为者记在 `created_by`。发布中断后恢复上次固定快照；后续编辑保留，可另存一版。问卷移走又移回后，下一次固定接着项目成果库里已有的最高版号，不把旧版当作中断记录交回。

只有收集中（`published`）的问卷接受提交和答卷文件导入：草稿和已停止收集（`closed`）的问卷只收本人的试填和本人导入的答卷文件，助理、MCP、流程、插件的提交与导入被拒绝，规则见下面的不变量。

编辑携带读取版本，保存冲突保留输入，重新读取前确认丢弃。填写时提交预览版本；题目变更会拒绝错版答卷。新答卷在原数据行保留提交时的题目，旧答卷没有快照时明确说明并保留原题号和答案。同次提交使用稳定 `request_id`，响应丢失后重试不重复保存。

验证与系统剩余范围见 [动作体系迁移记录](../../../specs/action-architecture/migration.md)。插件作者接入见 [Plugin 开发 · 对外 MCP](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：问卷目录、题目、预览填写与结果。
- 不负责：Goal 与 Artifact 事实、模型提供方、托管收集服务。
- 公开入口：`@molis-ai/molis-work-plugin-form`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（`defineErrorCodes`，错误码都是 `form.<原因>`，状态由错误种类决定，Form 不自带状态表）。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 每题回答沿现行 4000 字上限，原生填写与导出离线页在输入/提交时执行；多选合成后也检查。离线超限保留输入，不生成成功文件。两种页面的题名、必填状态和选项组都有可访问关联。
  - 缺模型时禁用 AI，保留本地操作。
  - 编辑带读取版本，冲突保留输入；重新读取前确认丢弃。
  - 新答卷保留提交时的题目快照；同次提交用稳定的 `request_id`，重试不重复保存。
  - 答卷来源由调用方的 audience 决定：只有本机界面（user）的填写页和试填可以用输入里的 `source` 自称 `fill` 或 `preview`；助理、MCP、流程、插件的答卷记为各自的来源，输入的 `source` 对它们无效。导入答卷文件（`form.answers.import`）没有 `source` 可自称：导入进来的答卷来源恒为 `file`（答卷出自对方的文件），不论谁导入；调用方的 audience 只决定问卷不在收集中时能不能导入。
  - 只有收集中（`published`）的问卷接受提交和答卷文件导入。草稿和已停止收集的问卷只收本人的两样东西：试填（本机界面的 `preview`），以及本人导入的答卷文件（页面在停止收集后仍提供导入）。填写页（`fill`）的提交，和助理、MCP、流程、插件来源的提交与导入，以 `form.closed`（HTTP 409）拒绝，不写任何答卷，重新开始收集后恢复；导入是整次调用被拒，在读任何一个文件之前，已导入过的文件也一样。判断是 `FormStore.submit` 与 `FormStore.importAnswers` 事务里的同一个 `assertTakesAnswers`，入口不各写一份；动作层把这个拒绝作为 `ActionError` 交出，MCP 客户端才读得到代码和原因（其他错误对 MCP 只显示为「能力执行失败」）。
  - 流程交来的标题和题目列表按问卷的上限（标题 80 字、40 题）截取后再收，不因超限而整次拒收。
  - 存成成果的每个副作用（intent、成果、完成记录）先等这次调用的授权，库与成果服务在写入的同一回合里再问原调用方（S-18），插件不手写这一步：被取消、撤权或提供方被替换的调用只留已经提交的阶段，不再多写成果（`tests/form-promote-authority.test.ts`）。
  - 项目被删除时平台按 Manifest 里 Home 库的 `project_rows`（`src/database.ts`：确认框里的标签与要删的表）删掉问卷与收到的全部回答，连同复制回执；插件的代码不参与，平台在自己的连接上删，库不存在时不创建，重复运行没有副作用（PG-024）。
- 改动后必跑：`node scripts/run-tests.mjs tests/form-actions.test.ts tests/form-runtime-routes.test.ts tests/form-mcp.test.ts tests/form-client-bundle.test.ts tests/creative-tools-plugins.test.ts tests/document-pin-after-move.test.ts tests/artifact-compare-moved.test.ts tests/project-deletion-owners.test.ts tests/document-plugins-error-model.test.ts tests/form-promote-authority.test.ts`
- 答卷边界、离线文件与 Form → Dataset 的定向回归：`node scripts/run-tests.mjs tests/content-owner-regressions.test.ts tests/content-portable-regressions.e2e.test.ts tests/work-placement-plugins.e2e.test.ts`（浏览器文件需要本机 Chrome；CSV 沿既有合同把回答中的换行显示为分号，源答卷保留换行）。
- 客户端（`src/browser/`）或它的打包改动加跑：`node scripts/run-tests.mjs tests/form-actions.e2e.test.ts tests/personal-plugins-review-fixes.test.ts tests/health-gates-browser-fetch.test.ts tests/health-gates-source-counts.test.ts`，再 `pnpm workspace:build` 后 `node scripts/gates/page-assets.mjs --base origin/main`（打包大小冻结在 `tooling/gates/page-assets.json`）。
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/model-ready-surfaces.e2e.test.ts`（页面在没有模型时显示「没有模型」，模型设置页宣布第一个模型（`molis-work:model-ready`）后它要重读；这个文件每个页面一条用例）。
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
