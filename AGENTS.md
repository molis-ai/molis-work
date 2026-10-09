# 在这个仓库里工作

Molis Work：本地优先的工作台，Goals 是权威真相源，插件经统一动作服务接入，AI 经同一 Home 的 Prologue Runtime。

## 先读哪里

| 要做的 | 读 |
| --- | --- |
| 产品承诺 | `PRODUCT.md` |
| 包清单、事实 owner、成熟度 | `docs/SSOT-MATRIX.md` |
| 分层与依赖规则 | `docs/system/ARCHITECTURE.md`、`docs/system/PACKAGE-BOUNDARIES.md` |
| 改某个包 | 该包 README 的「开发要求」：负责与不负责、依赖、不变量、改完必跑的测试（写法见 `docs/system/DEVELOPMENT-REQUIREMENTS.md`，门禁在 `pnpm boundary:check`） |
| 能力怎样注册、发现、调用、授权 | `specs/action-architecture/spec.md` §3「基本合同」 |
| 写或改插件 | `skills/molis-plugin-dev/SKILL.md` |
| 调模型、跑 Agent、提示词、模型设置 | `skills/molis-prologue-ai/SKILL.md`（手册 `docs/platform/PROLOGUE-AI.md`） |
| 界面 | `DESIGN.md`、`specs/craft-finish/spec.md`，规格板 `/__ui/catalog` |
| 某项任务 | `specs/<task>/spec.md`，开头写状态句；完成后按 `specs/README.md` 归档 |

## 硬约束

- 插件不 import 另一个插件的实现；跨模块只走公开 Contract。能力注册一次，由共同目录供页面、工作流、Agent、MCP 使用，不另写名单或宿主分支。
- 模型调用只经 `horizontal/agent-host`（唯一依赖 `@prologue/sdk` 的包）。一个 Home 只有一个执行进程；其他入口转发给常驻宿主。
- 等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再按读取时的版本提交。被取消、撤权、停用的调用不再写任何记录。
- 结果合同读取兼容、写入严格：回显已存历史的 schema 接受历史取值。
- 可信身份（actor、项目、安装）从调用上下文来，不从输入读；密钥只给引用。
- 新的内置插件只走 Plugin Runtime 装配（`apps/local-host/src/project-plugins.ts` 的监督器条目）：不再新增 `apps/local-host/src/<插件>-native-plugin-http.ts`，也不再往 `apps/workbench/src/builtin-plugins.ts` 加构建期条目。现存的旧路径插件名单冻结在 `tests/builtin-plugin-assembly-gate.test.ts`，只许减少。
- 插件只提供内容，挂在工作台的位置（目录、主区、浮层、设置、侧栏）；不出自己的整页、不开第二个浏览器标签页。例外清单见 `specs/artifact-positioning/spec.md` §4，门禁 `tests/shell-page-gate.test.ts`（CI 里跑）。
- 成果库只收人要留存、引用的固定版本与导入文件：类型在 manifest `artifacts.produces` 声明，带显示名与 owner 的预览动作；交给别的插件的数据是过程项（`process_items.produces`），不进成果库、侧栏文件和搜索。宿主按 manifest 拒绝未声明的写入；门禁 `tests/artifact-type-gate.test.ts`、`tests/artifact-declaration-gate.test.ts`（CI 里跑）。
- `vendor/prologue-sdk/` 只放当前使用的 Prologue 包（最多再加一份在途分支的）；换新包时删掉旧包，旧包从 Git 历史取。

## 构建与测试

- 安装：`pnpm install --frozen-lockfile --offline`。单包构建写成 `pnpm --filter <包> run build`（`--filter` 在 `run` 前）。
- 改过任何 `*/src`、`scripts`、`package.json` 后，跑全量前先整体 `pnpm build`：安装类测试比对源码与构建指纹。
- 全量回归期间不要改源码、脚本、`package.json` 和 `skills/`（安装类测试会拷贝 `skills/` 并比较两次安装的内容；`docs/`、`specs/` 可以改）；也不要并发构建。
- 跑测试：`node scripts/run-tests.mjs <文件…>`；浏览器用例需要本机 Chrome。判断是否自己引入的失败，用干净的基线工作树（`git worktree add --detach`）跑同一批文件对比。
- 测试截图默认写入已忽略的 `.impeccable/qa/review/`；要刷新仓库里的评审截图才设 `MOLIS_WORK_REVIEW_EVIDENCE=1`。
- 不为变绿而跳过、放宽或删除断言；先分清产品回归、预期变化、测试缺陷、环境与时序。
- `pnpm health:check`（CI 里也跑）：巨大单元、测试引用包内部、vendored SDK 份数、就地补表、spec 状态句只许减少。改小了就在同一个 PR 里 `node scripts/check-health-gates.mjs --update` 更新 `tooling/gates/baseline.json`；不要靠更新基线放过变大的。

## 协作

- 同一台机器上常有多个会话与工作树：开工前看 `git worktree list` 与其他会话在做什么；不重置、不覆盖别人的未提交改动，只提交自己的。
- 主检出常被真实 Home 的服务（4207）使用，改动前先确认；推送、开 PR、发布先问用户。
