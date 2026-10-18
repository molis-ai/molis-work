独立复查确认 #634 当前 `8c98220aacdc662db189467672fa283eff7ab91a` 的 P1：新 S-35 写明放置服务关闭后补偿移回一律拒，但 `apps/local-host/src/placement-call.ts:31–37` 的 revert 只在 `await ports.scope(...)` 前看 alive，后续等待及最终同步授权检查不再看它。

已执行该 head 完整生产 placement-call / PlacementService / subject-reader，配合真实 ActionService 与 Context Ledger。在补偿打开分区、以及补偿动作授权分别加受控等待：第一次移动 personal→q4 已提交，原调用被拒后进入补偿等待；这时令服务关闭，再释放等待。两条新拒绝断言均失败：alive=false 时 mover 仍被调用第二次，对象回到 personal，错误没有 actions.expired cause。原 PR 自带两条 S-35 对照均通过，说明当前用例只覆盖进入补偿前已经关闭。

隔离副本只在 revert 的最终同步 `assert_authority_current` 补 alive 检查，四条全过：mover 只调用一次、对象留在 q4、cause=actions.expired。未修改 #634 实现，请统筹交该线补上最后提交处的存活检查及这两类交错回归。源与复现：`/Users/yijunwang/code/molis-anti-corruption-20261017/wt-pages-commands/.impeccable/qa/review/pr634-revert-race/`；日志 `/tmp/molis-review1027-pr634-revert-race.log` 和 `...-fixed.log`。唯一防腐 spec §10.27 已记证据；这不是完整原生 Host 关闭实跑。

另有合流编号冲突：#634 的补偿约束和 #661 的受管工具约束当前都叫 S-35，#661 还用了 S-36；请统筹统一分配并同步表/测试。本线材料 S-34 的既有编号冲突也仍保持待协调，不擅自占号。#684 head 继续冻结不动。
