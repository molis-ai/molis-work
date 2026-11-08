# 轨道、分工与冲突规则

[执行目录](../spec.md) · [参考分类](../spec.md#reference)

<a id="section-5"></a>

## 冲突面与轨道

轨道只划定独占的文件：一条轨道独占的文件、同一份合同快照，同一时间只有一个写手在改；不碰同一批文件的片可以同时做，同轨的片按依赖先后叠分支，轨道之间按依赖并行。每批由它的主会话独立安排，独立任务开子会话，写手一律用子代理，一批可以同时有多个写手；会话不再按轨道跨批（用户 2026-11-05 定，[决定 26](decisions.md#decision-26)，取代决定 17 与决定 22 中「会话按轨道跨批」）；批 02 由 Codex 收尾不变。统筹是 Claude（本机）统筹会话（用户 2026-11-04 定，[决定 22](decisions.md#decision-22)）；谁正在做哪一项看[认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743)。下表最后一列只写评审职责与协作边界，不指定由哪个会话来写。历史热点与旧人员建议见[历史记录](baseline-and-history.md#track-history)。

| 轨道 | 这条轨道独占的文件 | 主要的活 | 有效归属与协作 |
| --- | --- | --- | --- |
| A 助理与输入 | `apps/workbench/src/scripts/client/assistant-*.ts`（`assistant-island.ts` 已拆成 24 个）、`apps/local-host/src/assistant/`、`packages/contracts/src/services/assistant.ts`、共用输入组件（新建的 `packages/design-system/src/composer*.ts`、`packages/plugin-sdk/src/ui/composer.ts`；D 已有文件里的导出行由 D 评审，统筹 2026-11-04 批）、助理的词典 | 统一输入框、个人助理的引导接点、回执余项、每日简报、主动助理 | 借用本轨文件按规则 7 由本轨落 |
| B Coding | `plugins/native/coding/`、Git、Diff 及 Files 退役涉及的现有消费者 | harness、下一阶段、质量保证、代码现代化 | 独立片交接需明确记录 |
| C1 合同与 SDK | `packages/contracts/src/platform/`、`packages/plugin-sdk/`（UI 子路径除外）、`packages/plugin-runtime/`、`tooling/gates/api/`、`tooling/gates/actions/` | 公共资料/目录、技能包、场景/角色/页面、授权及人审的合同，以及服务端批里的同步合同；沙箱包与 Runtime 的缺口；对抗式审查的 SDK 收拢；合同评审 | 公共合同台（C 轨）负责合同的跨批合审；批 02 由 Codex 收尾（[决定 26](decisions.md#decision-26)） |
| C2 AI 运行时 | `horizontal/agent-host/`、`horizontal/memory/`、`vendor/prologue-sdk/` | Prologue 采用与换包窗口、记忆、Skill/Context/MCP/Tool 四份策略、子代理的 Prologue 一半 | Memory 原负责人和暂停保留 |
| C3 平台新服务 | 每项服务一个新的 `horizontal/<服务>/` 包（用户 11-01 定新的平台服务不进宿主，宿主只做装配） | 观测和采集、评测、Sessions 历史与控制、智能呈现组合服务、主线、场景与生成页面的运行时、Attention 的提醒与唤醒；按包分清主人 | 每个服务包是独立的独占文件，不同的包可以同时写 |
| D 外观与语言 | `packages/design-system/`、`apps/workbench/src/i18n/`、ui-host、`packages/contracts/src/ui/` 与 `ui.ts`、`packages/plugin-sdk/src/ui.ts`（字体皮肤语言 A 段落在这里）、`DESIGN.md`、平台设置页 | 工作台标签/分屏/导航、公共资料呈现、VUX 收尾、字体皮肤语言、生成页面承载与交互预览、「授权与放行」一页（产品建议 H1） | D 轨合审组件板新增；负责公共视觉与 UI 文件 |
| E 插件 | Coding 一族以外的 `plugins/native/<插件>/`、新插件包 | 体验债、风险、工作简报本体、创作台的插件侧实现、场景所需插件配置与结果落点、情境 W4～W6、插件小功能 | 插件实现与定样按已有分工 |
| F 场景引导与发布 | `apps/desktop/`、安装器、`docs/releases/`、引导页与引导路由 | 首次/项目/任务引导完整路径、设置映射、首日旅程；运行条件、签名与升级、正式 OAuth | 账号、证书、真实 Home 按原用户边界 |
| G 服务端 | 同步 Worker（`personal` 分支上的 `apps/sync-worker/`）、平台同步服务与团队协作服务（新的 `horizontal/` 包，见 C3 一行的用户决定）；各插件 Manifest 里的同步声明按规则 4 一起落；M2 的桌面一侧在 `apps/desktop/`，由 F 落（规则 7） | [服务端批](server-batch.md#server-batch)：同步合同、Worker、各插件接入、两台真电脑验收，团队协作与团队记忆，M2 的服务一侧；01～89 期间不开工 | personal 分支上已有的工作保留；用户定开工，C 轨评合同，F 写桌面部分 |

本文里的“C 轨”“1·C”指 C1～C3 合起来。C1～C3 各有独占的文件，按文件判断冲突：同一批文件、同一份快照同一时间一个写手，不同的可以同时写（[决定 26](decisions.md#decision-26)取代决定 17 的「C 轨一个写手」）。

规则：

1. **合同先行。** 要改 Manifest、SDK 或 `packages/contracts` 的，在本批分支上先做合同（带 `pnpm api:update`、`pnpm actions:update` 的快照），实现叠在后面，合同和实现随本批 PR 一起合入；设计稿的评审、合审不变，公共合同台（C 轨）的合审在最终的头上，本批跑全量（[开发流程第 8.4 节](development-workflow.md#batch-grouping)，[决定 31](decisions.md#decision-31)，用户 2026-11-07 定）。只有别的批、服务端批或别的片确实在等这份合同，或有人排队改同一份快照时，才切出一个只改合同的小 PR，C 轨评审、尽快合。合同按快照排队：`tooling/gates/api/` 下同一份子路径快照同一时间只有一个批次或合同 PR 在改，不同子路径可独立设计／评审；同一个合同文件、同一份快照同一时间只有一个写手在改，改之前在认领板认领；Manifest（`packages/contracts/src/platform/plugin.ts`，快照 10-19 起改过 48 次）最热，C1 先把它按功能拆成几段声明，技能包、同步、场景、语言样式各改各的。共同设计可并行，写合同按实际依赖串行。技能包、场景与生成页面、情境 W4、卡片撤销、字体皮肤语言 A 段的合同改动按这条排队，先核已有合同能否复用。
2. **换包窗口。** 每个阶段最多换一次 Prologue 包，放在阶段中段。这一阶段要上游补的东西提前列进窗口清单一起提，窗口外不换包。阶段 1 不换包：记忆 P0 沿原暂停与负责人边界，恢复授权后只做不需上游的部分；要上游的仍进窗口一，排期不等于解除暂停。阶段 2 的窗口一装子代理、P5 协作；记忆 SDK 余项仅在原暂停解除后纳入，并补项目助理团、主对话与后台任务所必需且当前 SDK 尚缺的能力，已有合同直接复用；阶段 3 的窗口二装 Skill、Context、MCP、Tool 四份策略要的上游能力。
3. **切换窗口。** 字体皮肤语言的 C 段（全部插件的文字与样式一次切换）占一个窗口，在 16：B 段验完即切（用户 2026-11-03 定）。窗口里 E 轨不改插件的界面文字和样式，只做逻辑；新插件在窗口之前继续用现行写法（内置插件不写 `ui.locales`，决定 20、用户 2026-11-07 定），窗口里和存量一起转。窗口只管这些共享文件的合入时段，独立服务逻辑按实际依赖和所在轨道的写手推进。同步已移到 M1 之后的服务端批，不与这个窗口相交。
4. **同路径一起落。** 碰同一批聚合文件（`scripts/gates/page-assets.mjs`、`tests/ci-product-subset.txt`、`packages/contracts/src/platform/dom-events.ts`、`pnpm-lock.yaml`，以及不归任何轨道的宿主与外壳热文件：`apps/local-host/src/index.ts`、`project-plugins.ts`、`project-host.ts`、`web-request.ts`、`plugin-host-services.ts`、`home-plugin-executor.ts`，`apps/workbench/src/index.ts`、`immersive-shell.ts`，`scripts/workspace-packages.mjs`、`scripts/check-package-boundaries.mjs`，`tooling/gates/actions/*.tsv`、`giant-exceptions.json`、`error-owners.json`）的 PR 按批落规则合成批 PR，冲突由统筹一次解。
5. **新插件按实际依赖安排。** 风险等独立新包可放空档；Work Brief 与首页合并后需要 C/D 先交公共来源／呈现和挂载，E 再接综合首页与简报核心，不能仍按完全独立的新包安排。各轨道只修改自己负责的部分。
6. **每批独立安排，轨道只管文件。** 每批由它的主会话独立安排：独立任务开子会话，写手一律用子代理，一批可以同时有多个写手；会话不再按轨道跨批（用户 2026-11-05 定，[决定 26](decisions.md#decision-26)）。轨道只管独占文件：一条轨道独占的文件、同一份合同快照，同一时间只有一个写手在改，同轨的片按依赖先后叠分支。
7. **借文件由主人落。** 别的轨道的需求要改某条轨道独占的文件时，由那条轨道落这处改动：交给正在改这批文件的写手；没人在改时，在认领板认领后单开一片先落。需求方叠在后面。阶段 1 已知两处：技能包要改助理的 `methods()`（`apps/local-host/src/assistant/assistant-work-reads.ts`），harness R2 要改委派入口（`apps/local-host/src/assistant/assistant-executor.ts`），都在 A 轨。这两处和输入框的文件不重叠，对应合同就绪时插进来，不挡输入框的大改；阶段 1 A 行的「先……再……」按这条读。场景引导同理：F 轨负责需求与完整路径，个人助理接点由 A 落，角色/设置/Runtime 公共能力由 C 落，工作台页面与视觉由 D 落，插件配置和工作流程由 E 落；F 不横跨这些独占文件另写一套。

<a id="section-5-1"></a>

### C 轨职责与写入边界

C1 管合同与快照，C2 管 AI 运行时与换包，C3 管独立平台服务；实际顺序只维护在[执行目录](../spec.md#execution-batches)所链接的批次详情。设计与只读核查可以并行；实现由各批派写手（[决定 26](decisions.md#decision-26)），同包、同合同快照同一时间只有一个写手。

创作台、Sessions、团队仍是各自完整交付项，未分配的保持待分配；C/D/E/G 是所需的协作职责，不取代原任务负责人。服务端批开工后，合同同样按本文件规则 1 排队。

<a id="section-5-2"></a>

### 批次与轨道对照

认领前查这里：一项占哪条轨道，决定它要不要等别人。下面三张表覆盖全部 87 批、199 个交付项，由批次详情与需求记录推导，用户 2026-11-04 确认。[全景图](https://molis-ai.github.io/molis-work/)按它算「可领」。执行目录增删或改名交付行时，同一个改动里改这里。

怎样算占用：

- **只有写实现的项占用。** 定样、只读核查、验收、文档治理不占，依据是[执行规则](execution-rules.md)的可并行项。
- **只有主轨道占用，协作轨道不占。** 协作部分要改别的轨道独占的文件时，按上面的规则 7 由那条轨道落。
- **同轨的实现项碰同一批独占文件时串行做。** 不碰同一批文件的可以同时做；同一份合同快照同一时间只一项。C1～C3 按各自的独占文件判断（[决定 26](decisions.md#decision-26)）。
- **「统筹」没有主轨道。** 由统筹排期，各处改动按所在的包占对应轨道；落在不归任何轨道的宿主文件的，按规则 4 一起落。这种串行表里表达不出来。

**整批在一条轨道：**

| 轨道 | 批次 | 其中不占用的项 |
| --- | --- | --- |
| A 助理与输入 | [09](batches/09.md)、[10](batches/10.md)、[11](batches/11.md)、[32](batches/32.md)、[51](batches/51.md)、[53](batches/53.md)、[57](batches/57.md)、[58](batches/58.md) | — |
| B Coding | [64](batches/64.md)、[66](batches/66.md)、[83](batches/83.md)、[84](batches/84.md)、[85](batches/85.md) | — |
| C1 合同与 SDK | [05](batches/05.md)、[08](batches/08.md)、[20](batches/20.md)、[46](batches/46.md) | — |
| C2 AI 运行时 | [31](batches/31.md)、[41](batches/41.md) | — |
| C3 平台新服务 | [28](batches/28.md)、[29](batches/29.md)、[30](batches/30.md)、[34](batches/34.md)、[59](batches/59.md)、[62](batches/62.md) | — |
| C（同批细分不同或未细分） | [22](batches/22.md)、[24](batches/24.md)、[36](batches/36.md)、[39](batches/39.md)、[42](batches/42.md)、[60](batches/60.md)、[61](batches/61.md) | [24-1](batches/24.md#batch-24-item-1)、[24-3](batches/24.md#batch-24-item-3)、[60-3](batches/60.md#batch-60-item-3) |
| D 外观与语言 | [07](batches/07.md)、[13](batches/13.md)、[14](batches/14.md)、[16](batches/16.md)、[40](batches/40.md)、[70](batches/70.md) | — |
| E 插件 | [17](batches/17.md)、[18](batches/18.md)、[19](batches/19.md)、[38](batches/38.md)、[47](batches/47.md)、[54](batches/54.md)、[67](batches/67.md)、[68](batches/68.md)、[69](batches/69.md)、[76](batches/76.md)、[77](batches/77.md)、[81](batches/81.md) | [47-4](batches/47.md#batch-47-item-4)、[54-3](batches/54.md#batch-54-item-3)、[54-8](batches/54.md#batch-54-item-8)、[67-3](batches/67.md#batch-67-item-3)、[67-6](batches/67.md#batch-67-item-6) |
| F 场景引导与发布 | [44](batches/44.md)、[74](batches/74.md) | — |
| G 服务端 | [SRV-2](batches/srv-2.md)、[SRV-5](batches/srv-5.md)、[SRV-6](batches/srv-6.md)、[SRV-7](batches/srv-7.md) | [SRV-5-3](batches/srv-5.md#srv-5-item-3)、[SRV-5-4](batches/srv-5.md#srv-5-item-4)、[SRV-5-5](batches/srv-5.md#srv-5-item-5) |

**整批都不占用：**

| 批次 | 负责轨道 |
| --- | --- |
| [01](batches/01.md) | 不属于任何轨道 |
| [03](batches/03.md) | D、A |
| [04](batches/04.md) | F |
| [21](batches/21.md) | C3 |
| [56](batches/56.md) | F |
| [71](batches/71.md) | C1 |
| [75](batches/75.md) | C3 |
| [82](batches/82.md) | 不属于任何轨道 |
| [89](batches/89.md) | 不属于任何轨道 |
| [SRV-1](batches/srv-1.md) | G、C1、C |
| [SRV-4](batches/srv-4.md) | G、C |

**逐项看（批内不止一条轨道，或含统筹、不属于轨道的项）：**

| 交付项 | 名称 | 主轨道 | 占用 | 协作 |
| --- | --- | --- | --- | --- |
| [02-1](batches/02.md#batch-02-item-1) | 遗留事项、主人与唯一待办 | 不属于任何轨道 | 否 | — |
| [02-2](batches/02.md#batch-02-item-2) | 共享核心、SQLite 驱动与合同复位 | C1 | 是 | A、B、C2、E |
| [02-3](batches/02.md#batch-02-item-3) | 版本归一与重建清理 | 统筹 | 否 | — |
| [02-4](batches/02.md#batch-02-item-4) | 升级起点与合同规则 U0 | C1 | 否 | — |
| [02-5](batches/02.md#batch-02-item-5) | 对外许可口径与 BACKLOG 整理 | 不属于任何轨道 | 否 | — |
| [06-1](batches/06.md#batch-06-item-1) | 公共资料与迁移清单 | C1 | 是 | D |
| [06-2](batches/06.md#batch-06-item-2) | 文档记录协议与 SDK 共用实现 | C1 | 是 | A、B、E |
| [06-3](batches/06.md#batch-06-item-3) | 宿主调用整治与缓存核查 | 统筹 | 否 | — |
| [06-4](batches/06.md#batch-06-item-4) | 各包调用成本补齐 | C1 | 是 | E |
| [12-1](batches/12.md#batch-12-item-1) | Coding 执行、委派与可见状态 | B | 是 | A |
| [12-2](batches/12.md#batch-12-item-2) | 材料进入项目与 Coding 接续 | F | 是 | B |
| [15-1](batches/15.md#batch-15-item-1) | 确定组合平台服务 | C3 | 是 | — |
| [15-2](batches/15.md#batch-15-item-2) | 公共来源、呈现组件与首批入口 | D | 是 | A、B、C1、C3、E |
| [15-3](batches/15.md#batch-15-item-3) | 基础首页与 Feed 归属 | D | 是 | C1、E |
| [25-1](batches/25.md#batch-25-item-1) | 常驻、休眠与单 Home 执行恢复 | F | 是 | C2 |
| [25-2](batches/25.md#batch-25-item-2) | 按主人隔离升级失败 U3 | C1 | 是 | D |
| [26-1](batches/26.md#batch-26-item-1) | 签名、公证与安装准备 | F | 是 | — |
| [26-2](batches/26.md#batch-26-item-2) | 正式 OAuth 应用 | F | 否 | — |
| [26-3](batches/26.md#batch-26-item-3) | 原生组件预置与自检 | F | 是 | — |
| [26-4](batches/26.md#batch-26-item-4) | 本机日志、崩溃恢复与诊断包 | F | 是 | D |
| [26-5](batches/26.md#batch-26-item-5) | 插件升级 U4 与合同过渡 U5 | C1 | 是 | A、E |
| [26-6](batches/26.md#batch-26-item-6) | 副本演练与回退 U6 | F | 是 | — |
| [27-1](batches/27.md#batch-27-item-1) | 基础交互体验债 | E | 是 | A、D |
| [27-2](batches/27.md#batch-27-item-2) | 代码／Diff 及性能余项 | D | 是 | B |
| [27-3](batches/27.md#batch-27-item-3) | 首批文案与帮助 | D | 是 | A、B、E |
| [27-4](batches/27.md#batch-27-item-4) | Runtime、Goals 与沙箱余项 | C1 | 是 | E |
| [27-5](batches/27.md#batch-27-item-5) | 宿主出口、文档门禁与各包清理 | 统筹 | 否 | — |
| [33-1](batches/33.md#batch-33-item-1) | Coding 任务与环境恢复 | B | 是 | — |
| [33-2](batches/33.md#batch-33-item-2) | 材料、大清单与重启接续 | F | 是 | — |
| [35-1](batches/35.md#batch-35-item-1) | 引导接入已有 Sessions | F | 是 | C3 |
| [35-2](batches/35.md#batch-35-item-2) | Coding A 期 | B | 是 | — |
| [37-1](batches/37.md#batch-37-item-1) | 生成页面运行、采用与恢复 | C3 | 是 | C1、D、E、F |
| [37-2](batches/37.md#batch-37-item-2) | 事项切换与工作台状态 | D | 是 | B、E |
| [43-1](batches/43.md#batch-43-item-1) | 项目助理团执行与交付 | A | 是 | C2 |
| [43-2](batches/43.md#batch-43-item-2) | Dataset 汇总、追加与规模性能 | E | 是 | — |
| [45-1](batches/45.md#batch-45-item-1) | 情境 W4 创建与准备声明 | E | 是 | C1、F |
| [45-2](batches/45.md#batch-45-item-2) | 通用任务引导与场景复用 | F | 是 | A、E |
| [52-1](batches/52.md#batch-52-item-1) | 回执与交互余项 | A | 是 | B、C2、E |
| [52-2](batches/52.md#batch-52-item-2) | 智能呈现第二片 | D | 是 | A、C1、C3、E |
| [52-3](batches/52.md#batch-52-item-3) | 主线第二片 | A | 是 | D、E |
| [55-1](batches/55.md#batch-55-item-1) | Attention 唤醒、角标与系统通知 | F | 是 | C3 |
| [55-2](batches/55.md#batch-55-item-2) | 切换后新入口文字与翻译复核 | D | 否 | — |
| [55-3](batches/55.md#batch-55-item-3) | N22 全量迁移与收口 | 不属于任何轨道 | 否 | A、B、C1、E |
| [63-1](batches/63.md#batch-63-item-1) | 主动发现、持续工作与周期报告 | A | 是 | C3、F |
| [63-2](batches/63.md#batch-63-item-2) | 智能组合第三片 | C3 | 是 | A、C2、E |
| [63-3](batches/63.md#batch-63-item-3) | 主线建议与跨项目个人视图 | A | 是 | C3 |
| [63-4](batches/63.md#batch-63-item-4) | 初始场景 Skill 与默认配置 | A | 是 | E |
| [63-5](batches/63.md#batch-63-item-5) | 访谈初始化与工作记忆 | A | 是 | C2 |
| [63-6](batches/63.md#batch-63-item-6) | 回执阶段 5 | A | 是 | C2 |
| [63-7](batches/63.md#batch-63-item-7) | 安静准备与观察试用 | A | 是 | C、C3 |
| [65-1](batches/65.md#batch-65-item-1) | Coding 自检、评审与有界迭代 | B | 是 | C2 |
| [65-2](batches/65.md#batch-65-item-2) | 简化与安全专科评审 | B | 是 | — |
| [65-3](batches/65.md#batch-65-item-3) | Goals 依据三档与同一验收卡 | E | 是 | — |
| [72-1](batches/72.md#batch-72-item-1) | 技能包、工作流与生成插件导入导出 | C | 是 | E、D |
| [72-2](batches/72.md#batch-72-item-2) | 场景方案与保存操作面导入导出 | C | 是 | — |
| [72-3](batches/72.md#batch-72-item-3) | 整份 Home 导出与导入 U7 | F | 是 | C1 |
| [72-4](batches/72.md#batch-72-item-4) | 业务数据导出回读 | 不属于任何轨道 | 否 | — |
| [88-1](batches/88.md#batch-88-item-1) | 情境 W7 与总纲收口 | E | 是 | A、B、C1、D |
| [88-2](batches/88.md#batch-88-item-2) | 回执阶段 6 的各场景 | E | 是 | F |
| [88-3](batches/88.md#batch-88-item-3) | Skill 效果比较 | A | 是 | C3 |
| [SRV-3-1](batches/srv-3.md#srv-3-item-1) | 团队关键协作实现 | G | 是 | C、D、E |
| [SRV-3-2](batches/srv-3.md#srv-3-item-2) | 双身份真实协作验证 | C | 否 | D、E、G |
| [SRV-8-1](batches/srv-8.md#srv-8-item-1) | 自动更新与回退 | F | 是 | G |
| [SRV-8-2](batches/srv-8.md#srv-8-item-2) | 在线备份与恢复 | G | 是 | D、F |
| [SRV-8-3](batches/srv-8.md#srv-8-item-3) | 可选崩溃上报 | G | 是 | F |
