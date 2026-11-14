# Work Brief

项目的简报：各来源此刻怎么样、几句话的现状（每句后面是它的依据）、要你处理什么、和上次比变了什么、下一步。装了 Work Brief 的项目，简报就是项目首页的内容（`presentation.overview.lead`），移除后回到平台的基础首页。个人简报把各项目简报里要你处理的事和没处置的下一步汇到一处，带项目或个人的标签。

包名：`@molis-ai/molis-work-plugin-work-brief`。工作区内部包，Home 与项目两个实例（`createHomeWorkBriefPlugin()`、`createWorkBriefPlugin()`，登记上的 `runtime` 与 `project_runtime`），不在宿主里手写装配。需求见 [specs/work-brief/spec.md](../../../specs/work-brief/spec.md)，合同设计见 [contract-design.md](../../../specs/work-brief/contract-design.md)，版式见 [docs/design/work-brief-core/](../../../docs/design/work-brief-core/README.md)。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/plugin.ts](src/plugin.ts)、[src/home-plugin.ts](src/home-plugin.ts) | 项目那一半与 Home 那一半：把库、动作目录接到处理器上 |
| [src/actions.ts](src/actions.ts) | 动作合同（列出、读取、保存、刷新、修改、处理提案、固定、下一步） |
| [src/briefs.ts](src/briefs.ts) | 简报的保存、刷新、人工修改与提案合并 |
| [src/reading.ts](src/reading.ts) | 以调用者身份读各来源的概况和每条依据（`actions:delegate`） |
| [src/model.ts](src/model.ts) | 简报、版本、依据、下一步的形状，两版之间的比较 |
| [src/fix.ts](src/fix.ts) | 把一个版本固定成成果 |
| [src/next.ts](src/next.ts) | 下一步：按 SDK 的操作卡规则执行一次、放一放、交给助理 |
| [src/personal.ts](src/personal.ts) | 个人简报：跨项目汇总 |
| [src/presentation.ts](src/presentation.ts) | 呈现声明、首页概况与首页主区内容 |
| [src/store.ts](src/store.ts)、[src/database.ts](src/database.ts) | Home 库 `work-brief` 的表与读写 |
| [src/browser/](src/browser/) | 页面：`client.ts` 接动作，`brief.ts` 画简报与个人简报，`parts.ts` 是小零件 |

## 开发要求

- 负责：简报及其版本、每句话保存时的依据（对象、当时的版本号和标题）、人工修改、待处理的提案、下一步的处置、固定的版本、个人事项的汇总。
- 不负责：别的插件的内容和状态（只经它们公开的概况、读取器和动作读，页面上的对象交给平台挂载位）；定时（Schedule）；调用模型（本插件不调 AI，草稿由助理经 `work-brief.briefs.save` 交进来）。
- 公开入口：`@molis-ai/molis-work-plugin-work-brief`（`src/index.ts`，经 `dist` 导出）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 只读写自己的库；不查别的插件的表，不复制它们的状态。读不到的来源或依据标过期、缺口或未授权，不编造，也不当成「正常」或零。
  - 没有口述标记的句子至少一条依据，依据必须是保存时以调用者身份读得到的对象；读不到时保存当场失败并指出是哪一条。
  - 刷新不调模型；和上一版没有不同就不存新版本。打开页面只读已存的内容，不刷新、不启动任务。
  - 人改过的句子不被新草稿直接覆盖：不一致时草稿作为提案等本人逐处选择。提案等待期间本人再改，提案的冲突表跟着重算。
  - 本人以外的调用者刷新，不把它读不到的来源和依据写成缺口；返回给任何调用者的都只是它看得到的部分。
  - 下一步的执行没有确认结果（被取消、撤权、进程停止）时读作「结果未确认」，由本人核对后清除，不自动重跑。
  - 没有 Goals 的项目里完整可用；不认任何插件自己的状态词，来源轮到谁只从本简报的内容和上一版的比较推出。
  - 写按读到的 `revision` 提交，不对报 `work_brief.conflict`；失败都是 `ActionError`，码是 `work_brief.<原因>`。
  - 界面文字走语言文件（`locales/`），文字里不许有 `<`、`>`、`&`、`"`、`'`。
- 改动后必跑：`node scripts/run-tests.mjs tests/work-brief-plugin.test.ts`；改页面（`src/browser/`、`src/styles.ts`、`src/ui.ts`、`locales/`）加跑 `tests/work-brief-page.e2e.test.ts`（需要本机 Chrome）和 `tests/ui-text-locale-files.test.ts`。
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-plugin-work-brief typecheck
```

```bash
pnpm --filter @molis-ai/molis-work-plugin-work-brief build
```
