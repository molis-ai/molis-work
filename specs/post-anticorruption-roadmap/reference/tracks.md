# 轨道、分工与冲突规则

[执行目录](../spec.md) · [Reference 分类](../spec.md#reference)

<a id="section-5"></a>

## 冲突面与轨道

自 10-12 起合入 main 的 PR 里，改得最多的代码文件：`scripts/gates/page-assets.mjs`（127 次）、`apps/local-host/src/index.ts`（79）、`apps/workbench/src/scripts/client/assistant-island.ts`（55）、`tests/ci-product-subset.txt`（55）、`plugins/native/coding/src/client.ts`（47）、`packages/contracts/src/platform/plugin.ts`（46）、`apps/local-host/src/assistant/assistant-service.ts`（43）、`packages/design-system/src/styles/craft-finish.ts`（41）。防腐收尾后宿主入口会变薄，阶段 0 重新量一次；其余几处正是后面需求最密的地方，所以按它们分轨道：

11-02 重量（10-19 起 main 的 694 个提交，不算文档与快照）：`scripts/gates/page-assets.mjs` 118 次、`apps/local-host/src/index.ts` 65、`tests/ci-product-subset.txt` 36、`packages/contracts/src/platform/plugin.ts` 35、`pnpm-lock.yaml` 31、`apps/local-host/src/project-plugins.ts` 31、`packages/plugin-runtime/src/index.ts` 30、`apps/local-host/src/web-request.ts` 30、`scripts/workspace-packages.mjs` 28、`assistant-island.ts` 28。宿主入口仍是第二热的文件；宿主与工作台外壳的几个热文件不归任何轨道，按规则 4 一起落。

| 轨道 | 这条轨道独占的文件 | 主要的活 | 建议谁做 |
| --- | --- | --- | --- |
| A 助理与输入 | `apps/workbench/src/scripts/client/assistant-*.ts`（`assistant-island.ts` 已拆成 24 个）、`apps/local-host/src/assistant/`、`packages/contracts/src/services/assistant.ts`、共用输入组件、助理的词典 | 统一输入框、个人助理的引导接点、回执余项、每日简报、主动助理 | Claude（交互与视觉） |
| B Coding | `plugins/native/coding/`、Git、Diff 及 Files 退役涉及的现有消费者 | harness、下一阶段、质量保证、代码现代化 | Claude 主写，边界清楚的小片给 Codex |
| C1 合同与 SDK | `packages/contracts/src/platform/`、`packages/plugin-sdk/`（UI 子路径除外）、`packages/plugin-runtime/`、`tooling/gates/api/`、`tooling/gates/actions/` | 公共资料/目录、技能包、场景/角色/页面、授权及人审的合同，以及服务端批里的同步合同；沙箱包与 Runtime 的缺口；对抗式审查的 SDK 收拢；合同评审 | Claude（兼管合同评审） |
| C2 AI 运行时 | `horizontal/agent-host/`、`horizontal/memory/`、`vendor/prologue-sdk/` | Prologue 采用与换包窗口、记忆、Skill/Context/MCP/Tool 四份策略、子代理的 Prologue 一半 | Claude |
| C3 平台新服务 | 每项服务一个新的 `horizontal/<服务>/` 包（用户 11-01 定新的平台服务不进宿主，宿主只做装配） | 观测和采集、评测、Sessions 历史与控制、智能呈现组合服务、主线、场景与生成页面的运行时、Attention 的提醒与唤醒；按包分清主人；[决策记录](decisions.md#section-7)第 17 项确认前由 C 轨一个写手顺序实现 | 按包分派 |
| D 外观与语言 | `packages/design-system/`、`apps/workbench/src/i18n/`、ui-host、`packages/contracts/src/ui/` 与 `ui.ts`、`packages/plugin-sdk/src/ui.ts`（字体皮肤语言 A 段落在这里）、`DESIGN.md`、平台设置页 | 工作台标签/分屏/导航、公共资料呈现、VUX 收尾、字体皮肤语言、生成页面承载与交互预览、「授权与放行」一页（产品建议 H1） | Claude |
| E 插件 | Coding 一族以外的 `plugins/native/<插件>/`、新插件包 | 体验债、风险、工作简报本体、创作台的插件侧实现、场景所需插件配置与结果落点、情境 W4～W6、插件小功能 | Codex 独立片为主，界面定样由 Claude |
| F 场景引导与发布 | `apps/desktop/`、安装器、`docs/releases/`、引导页与引导路由 | 首次/项目/任务引导完整路径、设置映射、首日旅程；运行条件、签名与升级、正式 OAuth | Codex；账号、证书、真实 Home 只能你办 |
| G 服务端 | 同步 Worker（`personal` 分支上的 `apps/sync-worker/`）、平台同步服务与团队协作服务（新的 `horizontal/` 包，见 C3 一行的用户决定）；各插件 Manifest 里的同步声明按规则 4 一起落；M2 的桌面一侧在 `apps/desktop/`，由 F 落（规则 7） | [服务端批](server-batch.md#server-batch)服务端批：同步合同、Worker、各插件接入、两台真电脑验收，团队协作与团队记忆，M2 的服务一侧；01～89 期间不开工 | 接着 `personal` 分支原来的会话做，合同由 C 轨评审；开工时间、部署和真实账号只能你办 |

本文里的「C 轨」「1·C」指 C1～C3 合起来，按所改的包确定负责角色；[决策记录](decisions.md#section-7)第 17 项确认前由 C 轨一个写手顺序落地，其他轨道各有自己的写手。「建议谁做」一列写在 10-31 设备 A 的 Codex 全线接手之前，开工前按[决策记录](decisions.md#section-7)第 22 项重定。

规则：

1. **合同先行。** 要改 Manifest、SDK 或 `packages/contracts` 的，先单独开一个只改合同的小 PR（带 `pnpm api:update`、`pnpm actions:update` 的快照），C 轨评审、尽快合；功能 PR 叠在它后面。合同 PR 按快照排队：`tooling/gates/api/` 下同一份子路径快照同一时间只有一个合同 PR 在途，不同子路径可独立设计／评审，C 轨拆写手前实现仍由 C 轨一个写手顺序落；Manifest（`packages/contracts/src/platform/plugin.ts`，快照 10-19 起改过 48 次）最热，C1 先把它按功能拆成几段声明，技能包、同步、场景、语言样式各改各的。共同设计可并行，写合同按实际依赖串行。技能包、场景与生成页面、情境 W4、卡片撤销、字体皮肤语言 A 段的合同改动按这条排队，先核已有合同能否复用。
2. **换包窗口。** 每个阶段最多换一次 Prologue 包，放在阶段中段。这一阶段要上游补的东西提前列进窗口清单一起提，窗口外不换包。阶段 1 不换包：记忆 P0 沿原暂停与负责人边界，恢复授权后只做不需上游的部分；要上游的仍进窗口一，排期不等于解除暂停。阶段 2 的窗口一装子代理、P5 协作；记忆 SDK 余项仅在原暂停解除后纳入，并补项目助理团、主对话与后台任务所必需且当前 SDK 尚缺的能力，已有合同直接复用；阶段 3 的窗口二装 Skill、Context、MCP、Tool 四份策略要的上游能力。
3. **切换窗口。** 字体皮肤语言的 C 段（全部插件的文字与样式一次切换）占一个窗口，在 16：B 段验完即切（用户 2026-11-03 定）。窗口里 E 轨不改插件的界面文字和样式，只做逻辑；新插件在窗口之前就按新格式写，不留到窗口里转。窗口只管这些共享文件的合入时段，独立服务逻辑按实际依赖和所在轨道的写手推进。同步已移到 M1 之后的服务端批，不与这个窗口相交。
4. **同路径一起落。** 碰同一批聚合文件（`scripts/gates/page-assets.mjs`、`tests/ci-product-subset.txt`、`packages/contracts/src/platform/dom-events.ts`、`pnpm-lock.yaml`，以及不归任何轨道的宿主与外壳热文件：`apps/local-host/src/index.ts`、`project-plugins.ts`、`project-host.ts`、`web-request.ts`、`plugin-host-services.ts`、`home-plugin-executor.ts`，`apps/workbench/src/index.ts`、`immersive-shell.ts`，`scripts/workspace-packages.mjs`、`scripts/check-package-boundaries.mjs`，`tooling/gates/actions/*.tsv`、`giant-exceptions.json`、`error-owners.json`）的 PR 按批落规则合成批 PR，冲突由统筹一次解。
5. **新插件按实际依赖安排。** 风险等独立新包可放空档；Work Brief 与首页合并后需要 C/D 先交公共来源／呈现和挂载，E 再接综合首页与简报核心，不能仍按完全独立的新包安排。各轨道只修改自己负责的部分。
6. **一条轨道一个会话跨到底。** 同一条轨道在各阶段尽量由同一个会话接着做，少交接；开发本身也讲工作接得上。
7. **借文件由主人落。** 别的轨道的需求要改某条轨道独占的文件时，由那条轨道的会话落这处改动，需求方叠在后面。阶段 1 已知两处：技能包要改助理的 `methods()`（`apps/local-host/src/assistant/assistant-work-reads.ts`），harness R2 要改委派入口（`apps/local-host/src/assistant/assistant-executor.ts`），都在 A 轨。这两处和输入框的文件不重叠，对应合同就绪时插进来，不挡输入框的大改；阶段 1 A 行的「先……再……」按这条读。场景引导同理：F 轨负责需求与完整路径，个人助理接点由 A 落，角色/设置/Runtime 公共能力由 C 落，工作台页面与视觉由 D 落，插件配置和工作流程由 E 落；F 不横跨这些独占文件另写一套。

<a id="section-5-1"></a>

### C 轨按实际依赖排队

C 轨先交共用能力，再接消费者。下面由 C1～C3 分别负责合同、AI 运行时和新服务的设计与交接，[决策记录](decisions.md#section-7)第 17 项确认前由 C 轨一个写手顺序实现：C1 合同按快照排队，C2 跟换包窗口，C3 先定包与主人；第 17 项获准后按包并行，同一个包、同一份合同快照仍只有一个写手：

1. **阶段 0 末至 1 前段**：统一起点的 U0 规则、U1 升级链与 U2 金样回放先就位；再交公共资料／目录、智能呈现及工作台所需合同、SDK 共用工具与授权边界。B/D/F 可接入后，做技能包、首页与场景必要合同，同时核对主对话与后台任务能复用的输入、TaskBoard、执行及恢复合同，以及 #1730 逐项要求、产物版本、证据和用户决定的关联。
2. **阶段 1 后段**：采集设计和评测案例、Sessions 历史合同，含观察试用与正式执行的记录区分。创作台设计只补实测发现的缺口，Memory 仍遵守原暂停。
3. **阶段 2 前段**：接通采集、历史查询、Sessions 导入及最小评测，供简报与引导使用；其后完成角色／页面运行时及换包窗口所需能力。主对话、后台任务及逐项交付／返工复核直接消费已具备的合同，发现的必要缺口按同一合同队列和换包窗口补齐，不因采集尚未完成而等待。可独立的调用方继续，不等待全部平台任务结束。
4. **阶段 2～3**：创作台新插件交付、显式人审与 Coding 专项按依赖接入；再扩展评测、Sessions 控制、服务／策略收尾及场景组装合同；服务盘点→SDK 补缺→服务验收分出口，评测与主动实现分别推进，到效果验收汇合。

创作台、Sessions 与团队需求仍是各自的完整交付项（团队在服务端批），实现待分配的保持待分配；C/D/E/G 只标明所需平台或界面协作。服务端批开工后，同步与团队的合同同样按本节的合同队列排。共同设计与只读核查可以同时进行，合同和共享文件写入遵守单 writer 规则。
