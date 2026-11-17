# 要求、证据与认可

把一件工作要满足的各项要求挂到任何插件的对象上（助理的后台任务、待办、Goal……），记下每次交付的确切版本、每项要求的核对结果与证据、用户本人的认可或退回，并从这些记录现算每项此刻的状态。平台能力，不认识 Goals；没有 Goals 的项目照样完整可用（[主动助理](../../specs/proactive-assistant/spec.md) §7.3.1，PWA-144～147；[授权需求书](../../specs/agent-approval/spec.md) §3.5 的共用审查合同）。

包名：`@molis-ai/molis-work-module-acceptance`。工作区内部包，由 Host 装配成 `system.acceptance` 的六个动作：`acceptance.requirements.set@1`、`acceptance.deliveries.record@1`、`acceptance.reports.submit@1`、`acceptance.read@1`、`acceptance.review@1`、`acceptance.decide@1`。`acceptance.read@1` 一次读一个或几个对象（`subjects`，至多 32 个），按所问的顺序返回 `views`，只开一次库；`acceptance.decide@1` 声明 `requires_trusted_decision: true`，由受保护可信决定入口（Web、CLI、管理 MCP）经 `acceptance.review@1` 冻结审查快照后记下逐项决定与项目库的不可变 `ProjectTrustedDecision`（APR-15、APR-16）。认可结果在 `acceptance.db`、平台决定在项目库，不是同一个 SQLite 文件：验收事务先在 acceptance 库写入逐项决定，并在 `<Home>/acceptance/commit-intents/` 原子写入提交意向，acceptance 库先提交，项目库后提交；项目库最终提交失败时 Host 在下次启动/读取按意向幂等恢复。

## 一次典型调用

助理把「定价页改成三档」交给后台任务时，用 `acceptance.requirements.set@1` 把六项要求挂到这项任务上，其中一项写明要用户本人认可。任务交回第 3 版，用 `acceptance.deliveries.record@1` 记下版本和做出它的那一轮；再用 `acceptance.reports.submit@1` 逐项报告核对了哪一版、怎么核的、看到了什么、引用哪些证据。平台自己核对证据后给每条报告定层级：引用的命令确实由平台在做出这一版的那一轮里运行、正常结束、之后没再写文件，才算「机器核过」；只有自述、证据缺失、证据是旧版本的、核对的不是这个对象、命令失败，都照常保存、记下缺口、不算通过。

用户在要求栏里认可一项、退回一项（写原因）：页面把这次选择连同每项要求的版本和正在看的交付版本交给 `acceptance.decide@1`，其中任何一项在显示之后变过，整次不生效。返工交回第 4 版时写明动了哪几项：没动到的沿用它所依据的那一版的核验和认可，动到的回到「待核、待定」；上一轮没通过也没定的项不会因为没动到而算完成。

## 插件和页面怎样用

- **插件给自己的对象挂要求。** 在 Manifest 的权限里声明 `acceptance:report`（要读回状态再加 `acceptance:read`），经动作服务调用 `acceptance.requirements.set@1`、`acceptance.deliveries.record@1`、`acceptance.reports.submit@1`，`subject` 写 `{ provider_id: 自己的提供方, subject: { kind, id } }`。不用声明任何界面：这个对象只要是事项线上的事件，或是为某个事件办的后台任务，事件卡上就会出现逐项概况和「逐项审阅」。认可与退回不在插件手里，`acceptance.decide@1` 插件调不了。
- **助理的后台任务。** 助理交办时随 `delegate-work` 写要求，任务用 `report-delivery` 交回；宿主以这项任务自己的身份调用上面三个动作，对象固定是任务自己（`io.molis.work.assistant.rules` 的 `assistant_work`），模型给不了别的对象（S-assistant-delivery-own-object）。写法在 `apps/local-host/src/assistant/assistant-delegation.ts`，验证 `tests/assistant-delegation-acceptance.test.ts`。
- **工作台页面。** 事件卡的概况和要求栏走本人入口 `/api/acceptance/{read,decide,requirements}`（`apps/local-host/src/acceptance-http.ts`，S-work-line-person-doors），画法在 `apps/workbench/src/work-acceptance-parts.ts`，行为记在[事项线需求书](../../specs/work-line/spec.md) §6.5「逐项概况与要求栏」。

## 从哪里读代码

| 文件 | 用途 |
| --- | --- |
| [src/schema.ts](src/schema.ts) | Home 库 `acceptance/acceptance.db` 的结构：对象、要求的各个版本、交付、核对、决定；业务表只追加 |
| [src/store.ts](src/store.ts) | 追加与读取（不出包）；项目删除时清掉该项目的记录（`acceptanceProjectData`） |
| [src/intents.ts](src/intents.ts) | `<Home>/acceptance/commit-intents/` 的原子提交意向：临时文件 + fsync + rename；恢复成功后删除 |
| [src/state.ts](src/state.ts) | `acceptanceView`：从记录现算每项要求的状态、各轮记录和三个各自的进度（纯函数） |
| [src/service.ts](src/service.ts) | 五个操作的规则与证据核对（`weigh`）；调用方身份由 Host 给（`AcceptanceCaller`）；`openAcceptance` 是包对外的入口 |

合同在 `@molis-ai/molis-work-contracts/modules/acceptance`；Host 装配在 `apps/local-host/src/acceptance-actions.ts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。

```bash
pnpm --filter @molis-ai/molis-work-module-acceptance typecheck
pnpm --filter @molis-ai/molis-work-module-acceptance build
node scripts/run-tests.mjs tests/acceptance-requirements.test.ts tests/security-invariants-acceptance.test.ts
```

## 开发要求

- 负责：要求及其版本、交付版本与每一版动到哪几项、核对报告及平台给的层级与缺口、用户本人的认可与退回、各轮记录；从记录现算状态。
- 不负责：对象本身（归它的插件）、证据的正文（成果库的版本、Agent Host 的命令回执，都只存引用、读的时候按调用方的权限去原主人那里读）、决定请求在哪里显示（事件卡、要求栏归工作台）、动作的注册与授权（Host 装配）。
- 公开入口：`@molis-ai/molis-work-module-acceptance`（`src/index.ts`，经 `dist` 导出）；合同 `@molis-ai/molis-work-contracts/modules/acceptance`，形状沿用 `platform/reviews` 的共用审查合同。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`。不依赖 Goals、助理或任何插件的包。
- 不变量：
  - 层级只由平台得出：报告的输入里没有层级字段；拿不到平台事实的证据一律按自述计并记下缺口（S-acceptance-evidence-tier，PWA-144）。
  - 只有用户本人经受保护可信决定入口能认可或退回：`acceptance.decide@1` 绑定 `requires_trusted_decision: true` 与 `acceptance.review@1`，任何绕过受保护入口的直接调用、Agent、工作流、MCP、插件和插件转来的调用都拒，被拒的调用什么都不写（S-acceptance-person-decides）。
  - 提交意向与恢复：acceptance 库先提交，项目库后提交；项目库最终提交失败时保留完整平台决定记录，由 Host 在下次启动/读取按同一 `decision_id` 恢复，重复恢复幂等；不能把两个库说成同一个 SQLite 事务。
  - 交付过之后只有本人能改要求；改了的要求得到新版本，此前的核验与认可不再算数，改要求和返工分别记录（PWA-146）。
  - 认可记下它针对的要求版本和交付版本；之后的交付动到这一项、或要求变了，这一项回到待定，其余不受影响。
  - 除对象表外的记录只追加、不改写、不删除（项目删除时整项目清掉）；历史结论和证据引用都读得到。
  - 执行完成、核验通过、本人认可分开计数，谁也不替代谁；交付或返工一轮本身不让任何一项通过（PWA-145、PWA-146）。
  - 记录按项目隔离：同一个对象在别的项目里读不到这里的任何内容。
- 改动后必跑：`node scripts/run-tests.mjs tests/acceptance-requirements.test.ts tests/security-invariants-acceptance.test.ts`；改了合同再跑 `pnpm api:update`、`pnpm actions:update`，改了库结构跑 `pnpm schemas:update`。
- 相关手册：[specs/proactive-assistant/spec.md](../../specs/proactive-assistant/spec.md) §7.3.1；[specs/agent-approval/spec.md](../../specs/agent-approval/spec.md) §3.5；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
- 现在的边界（记在 [待办](../../specs/backlog/BL-acceptance-first-slice-limits.md)）：只有项目范围；「另一个会话复查」这一层级还没有（共用合同里没有这一档）；Goals 仍用自己的实现，到 44-3 改为消费这里。
