# T353C #1683 有限只读接续（一页）

原作者仍为**开发线2**；本页不转移归属。C=`07592e0fc36375b8d191d24ceafbd5e58d36d403`（tree `1213d13ae0e16fbc2c3a8de97168c227e514b8c8`），原stack base=`8a92616826de9925580566fdd375f3b5c2921133`。指定已采用M=`be0c777002509b6eb4e2c2187eb3a5765a5440f6`；B=`45b3dbfffdece73d006800535142444ef25e8045`仍是候选，根通知普通CI已绿，Full/采用未成。**C继续等B真正采用；本页未合树、建树、写refs、build/test/GH或改base。**

## 原8路径与依赖变化

| C原路径 | 新B／M相对旧base的变化；后继须保留 |
| --- | --- |
| `modules/artifacts/README.md` | B/M均未变；保C新增公开SDK依赖说明 |
| `modules/artifacts/package.json` | B/M均未变；保C的SDK workspace依赖 |
| `modules/artifacts/src/artifact-actions.ts` | B/M同一新增：importSources/importConnections允许Promise，handler正确await；在约120/244行，C的cutHead import与约220行摘要截取是不同hunk，两边都保 |
| `plugins/native/pages/src/intake-offers.ts` | B/M均未变；保C request_id的cutHead(...,160) |
| `plugins/native/todo/src/actions.ts` | B/M均未变；同上，仍160 UTF-16单元 |
| `pnpm-lock.yaml` | B仍旧base内容；M新增judgment-rules路径并与未采用B有knowledge SDK依赖差异。保最终main的路径、B的knowledge依赖及C的artifacts SDK importer，不能整份取任一边 |
| `scripts/workspace-packages.mjs` | B有desktop/workbench登记收口，M另有judgment-rules迁移；与C的artifacts extraWorkspaceDependencies不同hunk，保全部必要登记 |
| `tests/whole-units-gate.test.ts` | B/M尚无此文件；C的-i、无锚点tail模式、无匹配assert.fail、原名单与SDK两行断言均保留；新增输入见下 |

SDK `whole-units.ts`及SDK package.json在C/旧base/B/M逐blob相同；search-sources、action-fragments、Pages create-document及现有摘要/helper测试也未变。**不重审算法**：160/4000上限、已接受的代理边界变化与摘要参与searchRevisionOf规则保持。

## 合流风险与最小后继

上述共同文件是不同hunk，静态未见必须人工重写的重叠；未来真实main仍须复核，当前没有制造merge tree来宣称无冲突。真正的新门禁输入是 `plugins/native/pages/src/whole-characters.ts:2`（来自已采用T204/#1563）：`wholeEnds`清两端落单代理，非带N的截取。冻结对象只读字面量搜索为C **5行**、B **6行**、M **32行**；B多出的这一行不在C原ALLOWED中，B采用后会进入C扫描。**先由根限定该输入的处置归属/窄窗口，不擅加白名单、第九路径或改成另一算法；B的CI绿不关闭C此项。**

B实际采用后，原owner普通merge真正main：保M私有路径/登记及B迁移，再保C八路径；核SDK/依赖和摘要hunk。最小工程复核为匹配build、正常门禁/实际资源及完整 `whole-units-gate.test.ts`（扫描输入已变，旧1/1不能顶替）。若摘要hunk须手解，补完整 `artifact-search-summary.test.ts`；若异步来源handler须实质改解，再补对应 `artifact-document-import.test.ts`。其余按真实delta核抵，不能机械重跑32份。资源继承最终main/B的实际预算（含B Jelly +33与M settings减重），旧C总字节数不作新组合实测。

## 尚缺与可核抵证据

- C07592作者 **32文件395/395**只支持原输入，含28份README非浏览器及gate/摘要/comments/helper四份；静态同blob裁定可沿用，不改标成未来N独立执行。旧739/754、15个沙箱失败仍缺干净基线，B的508或Full不代C。
- **七份README浏览器仍未跑**，其测试blob在C/B/M全相同，不能把“相同”当通过：`tests/`下的 `todo.e2e.test.ts`、`todo-draft-recovery.e2e.test.ts`、`contextual-todo.e2e.test.ts`、`context-onboarding-todo.e2e.test.ts`、`todo-from-inbox.e2e.test.ts`、`todo-placement.e2e.test.ts`、`todo-assistant.e2e.test.ts`。由根安排并按最终输入结算。
- 6545073359的f236小写变异“点名新增行并变红”可核抵相同gate的 **-i/名单外拒绝**作者历史证据；6544859592中tail/小写SDK无匹配变异当时为绿，是缺陷历史，不能顶替修复后证明。6546163162及当前加强二审为静态；**无锚点tail／无匹配assert.fail仍未见独立动态原件**，原验证线先核已有有效记录，缺才补最小项。full=true、准确新头CI/Full与七份浏览器均不降级。

依据：[任务书](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-353.md)、[C作者原报告](/private/tmp/t353c-sync/REPORT.md)、[加强二审](/private/tmp/t353c-current-second/REPORT.md)及指定Git对象；这里只定位接续delta，不重开已有审查结论。
