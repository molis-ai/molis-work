# 系统评审问题修复

状态：执行中（2026-10-22，一骏恢复并授权先完成 PR 合入），负责人 Codex。先完成 Work #1018 的主线整合、缺陷修复和验证，再处理前几天 PR 的遗漏；工程通过、真实场景与一骏验收分别记录。

## 恢复范围（2026-10-22）

一骏要求先处理现有 PR 并合入 main，随后再处理前几天 PR 的遗漏；不要与防腐线重复。当前 chat 负责 Work #1018。Prologue #61 及该仓库其他 PR 已交由另一个会话处理，本 chat 不再推送或合并 Prologue。

Work 同步主线时保留 CHR-1 的宿主角色页面，以及 PG-035、宿主审查事件和 Git/Files 自行刷新等新实现。页面隔离只覆盖当前真正的插件页面；已移到宿主的角色页面沿主线装配，不恢复被删除的角色插件。保留本 PR 已授权的 Schedule/Shelf 改动，修复已有隔离流程并完成相关授权、浏览器和全量回归，不继续扩展其他防腐迁移。下文暂停记录是历史检查点，剩余项以恢复后的验证结果为准。

SYS-15-B1：已受理后台任务的动作可用性复查使用保留的可撤销授权，不回到已结束的 HTTP 请求控制；请求结束后可继续生成，安装撤权、提供方替换与项目关闭仍拒绝。定向验证 `tests/action-background-authority.test.ts`，真实浏览器验证 `tests/images-actions.e2e.test.ts`。

SYS-15-V1：隔离页通过既有对象上下文报告当前记录，外壳记住它并在刷新后恢复；返回列表须同步收起隔离页，不能只改外壳空容器。SYS-15-V2：真实图片生成完成、预览可见且下载字节正确，blob 媒体不扩大页面网络或脚本权限。验证 `tests/pages-actions.e2e.test.ts`、`tests/ppt-actions.e2e.test.ts`、`tests/images-actions.e2e.test.ts` 与 `tests/security-invariants-plugin-pages.e2e.test.ts`。

### 恢复后的集成验证（2026-10-22）

已整合 main 到 `d1f3784bb`，保留 SDK 公共高亮/富文本和 Coding 大 diff 性能实现。整体构建、依赖边界与健康门禁通过。真实浏览器已覆盖 Images 生成/预览/下载、Pages 编辑/恢复、PPT 编辑/发布恢复、Jelly、Shelf 与宿主 Characters；PPT 窄屏下载曾超时一次，单独重跑通过，保留诊断。其余回归正在集成分支上收口，不能据此宣布整体完成。

资源复核：新增共享隔离脚本 147,604 字节按 2026-10-21 已有授权冻结；工作台脚本 1,182,783 → 1,185,108（+2,325），创作台脚本 115,519 → 116,132（+613），分别来自页面身份/对象上下文桥和公共对话框、文件、设置服务。尝试再次压缩内嵌脚本无收益，宿主已在下发时做相同压缩；已删除冗余尝试。其余资源按实测降低预算，放行仅认本次准确基数，未放宽门禁规则。

## 暂停交接（2026-10-22）

本轮修复尚未全部完成。按一骏最新要求保存现有实现并开草稿 PR，不继续扩大修复或启动全量回归。前四个 Work 提交已覆盖资料整理/并发预算、流式文字/键盘焦点、Host 聚合/删除与桌面身份；本次追加保存 SYS-15 的公共服务、Schedule/Shelf 已做迁移及全部插件页面隔离。Prologue 原生边界修复另在 `a098dd1f`，尚未更换 Work 的 SDK 包。

最新整体构建通过。最近定向回归包括 Schedule 18 文件 121 项及驻留关闭/删除 5 项，Shelf 相关 11 文件 85 项，创作台与终端真实浏览器 2 文件 5 项；最后一批页面权限与上下文服务 5 文件 58 项通过。这些证据覆盖相应改动，不代表全量或内部完整验收。

恢复时先处理：
1. 图片生成的浏览器流程仍停在“生成中”；现有证据尚不能确定是后台结果未保存还是页面刷新问题，不将请求取消假设当成已确认根因。
2. Pages 的选区/共享工具栏桥已补实现并通过构建，尚未完成真实浏览器与新增授权边界验证。真实父页工具栏与隔离子页编辑器需要分别操作；其他旧浏览器用例也尚未全部迁移和验证。
3. Jelly/PPT/Pages 最新重跑在机器浏览器槽位排队期间取消，未取得通过结果；保留原业务断言，不能把仅迁移测试选择器记作功能通过。
4. 完成剩余 SYS-01～47 去向复核、最终 diff 评审、动作/API/页面资源及健康门禁收口，再跑所需全量。尚无最终产物实操或一骏本人验收。当前主线仍可能与本分支重叠，合并前需核对真实增量。

本轮接续系统评审的 SYS-01～47。Work 基线 `6d2361652bd167d07815d930cd04f802967292a3`，Prologue 基线 `95e177093a4efb60a286272892a89dc1e7ed31ba`，均已 fetch 核对。原 `pr-review-remediation` 的 PRR/QA 任务及主检出的未提交材料保持原归属。本 spec 是本轮 SYS 行为修复与逐项去向的唯一记录。

## 范围、方案与依赖

先修资料整理与并发额度（SYS-01～03），再处理流式文字与当前行为/测试缺陷（SYS-04～12），最后按真实信任边界处理桌面、目录与 Prologue 原生 Host（SYS-14～17）及其余确认项。原产品路线沿原 spec 和负责人推进；在途修复核对后关联，不复制实现。报告中的探针只用于根因定位，正式回归调用生产路径并控制真实异步交错。

第一组：`horizontal/knowledge` 每次发送前重新读取卡片和来源；项目删除使队列与运行中模型调用失效，清库后拒绝迟到写入；`apps/local-host` 把删除钩子接到这份生命周期。read/grep 在授权复核之后、同步分配额度并记账，避免 await 间隙让多次调用花同一份余额。失败的授权不消耗额度、不留回执。不改提示词、存储结构或用户额度。

第二组：SYS-04 每次 DOM 补丁前结束上一轮淡入，确保拆开的 Text 还原后再比较来源快照；同帧连续更新普通文字/strong 后检查完整 HTML、文字与节点保留。SYS-07 工具栏候选包括显式 tabindex 的项（含 roving 设置的 -1），用真实方向键验证 A→B→A 与单 Tab 入口。SYS-06 事务中的 get/all 在同一同步调用内启用 SQLite query_only，结束后恢复写入；SELECT/CTE SELECT 可读本事务新行，WITH DELETE/UPDATE/INSERT 不得写，失败仍能回滚。

SYS-05 各项目并行读取，目录发现与每个提供方各有 2 秒截止；超时传递 AbortSignal 并释放本轮等待，其他项目与提供方的结果照常返回。沿用现有 issues 和重试入口，迟到结果不能修改已返回快照；调用者取消则整轮拒绝。

SYS-08 复用 Pages 两种栏宽把手的相同样式以抵消新增字节，键盘焦点显示把手和铜色焦点线；在生产编辑器用 Tab/Shift-Tab 进入并检查焦点可见和键盘调宽。真实键盘回归额外发现编辑器把焦点在按钮上的 Tab 也当作正文缩进；仅当正文拥有焦点时执行缩进/单元格导航，让把手按原生 Tab 次序移动。SYS-09 目录单列“已取消”数量，只将 execution_blocked 计入受阻；生产事件投影/详情/胶囊已有“已取消、显式继续”语义，补生产投影回归，不重写其状态机。

第二组按对应包现有行为最小修复，翻译用真实词典验证，不降低原断言。安全组先核现行可信身份与用户授权入口，不增加历史兼容或特殊插件通道。SYS-15 一骏于本轮明确选择：保留目录授权，隔离插件页面，由宿主完成可信目录选择；不退回仅上传目录文件。页面不能获得宿主控制令牌，授权绑定真实安装和项目，跨安装/项目、未选择、取消与撤权均拒绝。上游源码修复、换包、消费者验收分别记录。

此前暂停要求已由本节顶部的恢复范围替代：先完成 Work #1018 并合入，再复核前几天 PR 遗漏；不发布、不发送其他 chat 消息。实现阶段由本 chat 写入，原视觉与防腐线保持其归属，交叠只做必要整合。此前 PR 快照（#934～986、#968）仅作历史线索，去向以恢复后的主线核对为准。

SYS-15 实施合同：复用 Host 已有的跨平台系统目录选择器，提示中使用 Runtime 的真实插件名称。HTTP 只接受插件 id，安装、调用者和项目由 Host 解析；不接收路径、安装 id 或 actor。授权存于 Home 服务，绑定当前激活实例、项目、actor，30 分钟有效；插件停止/撤权/重启、项目删除、取消选择均失效。读取从 Runtime 调用上下文取得身份，并在异步文件读取结束后再次检查。页面隔离采用平台共同的受限页面通道，插件不得读取父页面控制令牌或借通道调用任意 Host API；原生选择器为最后的人工选择边界。覆盖真实 Runtime/HTTP 的授权、跨作用域拒绝、迟到选择与读取取消，并用独立测试浏览器验证父页面访问和请求边界。浏览器上传仍可使用。

跨页面依赖沿同一动作目录迁移：页面只提交动作引用和业务输入，Host 按当前安装的 Manifest 与授权解析真实定义，再调用该实例已有的 PluginActionClient。自身动作固定到自身提供方，消费动作必须声明 consumes，且目标允许 plugin audience；页面不能提交 actor、项目、权限或动作 schema。请求、页面、安装与项目关闭的取消检查贯穿读取、执行和返回。终端使用 Host 绑定的会话句柄，工作区选择由可信宿主界面完成；不会把任意 URL、控制令牌或任意命令发送能力交给子页面。

## 验收标准与逐项去向

下表完成条件来自交接报告与 Excel；初始状态是候选证据，不代表本轮已验证。当前修复、测试、提交和外部依赖在后续记录逐项更新。原计划、在途、待验证项不得记作已完成。

| 编号 | 交接状态 | 优先级 | 完成条件 | 原承接 / 依赖 |
| --- | --- | --- | --- | --- |
| [SYS-01](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/horizontal/knowledge/src/organize.ts#L228) | 待处理 | P1 | **资料被排除后，排队中的正文仍送给模型**。每份资料发送前重读排除标记及当前来源；交错测试：A 等待时排除 B，B 零模型调用。 | 新增；PMAT-43 现有测试只覆盖启动前排除；待分配（knowledge） |
| [SYS-02](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/apps/local-host/src/knowledge-actions.ts#L179) | 待处理 | P1 | **删除项目后，资料整理继续发模型并重建用量**。删除时取消该项目的排队与运行整理；迟到结果和下一份材料均不得写回。验证模型只收到 A，三类记录保持清空。 | 新增；#935/#963 的插件作业保障未覆盖该服务队列；待分配（knowledge / local-host） |
| [SYS-03](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/horizontal/knowledge/src/index.ts#L260) | 待处理 | P2 | **同轮并发读取突破资料字符上限**。使预算分配与消费在并发 read/grep 下保持一致；6 次并发各读 12k，返回总和最多 60k，剩余额度准确。 | 新增；PMAT-11；待分配（knowledge） |
| [SYS-04](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/packages/design-system/src/browser/stream-text.ts#L67) | 待处理 | P1 | **流式淡入期间更新会永久丢字**。修正动画包装节点与源码快照的同步；连续更新混合文本和 strong，最终 DOM 必须等于完整渲染。 | 此前复查已确认；#940 的 grow 改动未覆盖本交错；待分配（design-system） |
| [SYS-05](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/apps/local-host/src/home-aggregate.ts#L47) | 待处理 | P2 | **首页聚合被单个不返回的提供方拖住**。定义每个提供方的截止、取消和部分结果；一个挂起时其他项目结果仍能返回，前端可重试。 | 此前复查已确认；PG-043 迁移没有覆盖超时；待分配（local-host） |
| [SYS-06](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/apps/local-host/src/plugin-database-client.ts#L68) | 待处理 | P2 | **Home 事务的 get 可执行 WITH DELETE**。让读方法拒绝带写副作用的语句；WITH DELETE RETURNING 必须失败且原行保留。 | 此前复查已确认；与项目库逐句守卫区分；待分配（local-host） |
| [SYS-07](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/packages/design-system/src/browser/roving-focus.ts#L18) | 待处理 | P2 | **通用工具栏的 tabindex 项失去方向键导航**。候选项不能因 roving 自己设成 -1 而消失；可见 tabindex span 的 A→B→A 应成立。 | 此前复查已确认；button 路径不受本缺陷影响；待分配（design-system） |
| [SYS-08](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/plugins/native/pages/src/styles.ts#L226) | 待处理 | P2 | **Pages 可键盘调宽的把手仍不可见**。补焦点可见状态；只用键盘进入栏宽、表格列宽把手时必须看见位置和当前状态。 | 此前复查已确认；VUX-06/23；待分配（Pages） |
| [SYS-09](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/plugins/native/goals/src/collection-model.ts#L41) | 待处理 | P2 | **取消的 Goal 被计入受阻**。统一取消与受阻的统计、文案和详情；对 invalidated 单独验证列表与胶囊。 | 此前复查已确认一半；勿把胶囊推断当复现；待分配（Goals） |
| [SYS-10](https://github.com/molis-ai/molis-work/actions/runs/39692652588) | 待处理 | P2 | **翻译迁移后，3 份产品测试仍用恒等翻译**。测试接真实中英词典和参数替换；保留原行为断言，三份文件均通过。 | 本次补充；分别与 #933、#931 的消费者变化相关；待分配（Coding / 验证） |
| [SYS-11](https://github.com/molis-ai/molis-work/pull/968) | 在途 | P2 | **Issue 固定追问的英文项仍使产品子集失败**。完成 #968 对应修复并保留精确固定问题的词典检查；在主线核对成功。 | 已有在途 #968；不重复开工；待分配（#968 承接） |
| [SYS-12](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/tests/companion-client-lifecycle.e2e.test.ts#L152) | 待处理 | P2 | **两份浏览器测试仍与当前接口/文案失配**。补 companion 的 L 参数；model-vision 按现行控件定位。用相应生产路径验证，保留业务约束。 | 此前复查；本轮未重新启动浏览器；待分配（验证） |
| [SYS-13](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/vendor/prologue-sdk/README.md#L1) | 已有计划 | P2 | **Prologue 上游修复尚未全部进入 Molis 包**。后续换包纳入 #53、#58；同步 answered 断言，跑 T5 与关停/导入负向回归及安装消费验证。 | BL-176 覆盖 #53；#58 的消费者验收需补；待分配（换包） |
| [SYS-14](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/apps/desktop/adapters/tauri/src/web_service.rs#L42) | 待处理 | P1 | **桌面仍按响应子串识别 4173 服务**。确认服务身份；移除无消费方的原生 PTY 命令或收紧真正需要的入口。真机验证假服务不能获得可信壳能力。 | 安全文档 F15；W2-19 不等于身份验证已完成；待分配（desktop） |
| [SYS-15](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/apps/local-host/src/plugin-directory-service.ts#L33) | 待处理 | P1 | **同源插件页面与目录 grant 的授权边界未闭合**。定义插件页可见权限；目录授权绑定安装/项目和用户选择，验证插件页不能靠控制令牌取得任意目录。 | PG-053/082 为相关迁移；需显式补安全验收；待分配（平台安全） |
| [SYS-16](https://github.com/molis-ai/prologue/blob/95e177093a4efb60a286272892a89dc1e7ed31ba/crates/prologue-host-tauri/src/network_guard.rs#L60) | 待处理 | P1 | **Prologue 原生 Host 私网地址判据不完整**。按解析后的 IP 判 IPv6/映射地址，并核 DNS 结果及重定向；拒绝私网负向用例走真实 Host。 | 此前复查已确认；当前 Molis 用 Node Host；待分配（Prologue 原生 Host） |
| [SYS-17](https://github.com/molis-ai/prologue/blob/95e177093a4efb60a286272892a89dc1e7ed31ba/crates/prologue-host-tauri/src/lib.rs#L425) | 待处理 | P1 | **Prologue 原生 Host 不按已声明沙箱档位拒写**。写文件与进程入口核当前档位；read-only 的写和命令必须拒绝且无副作用。 | 此前复查已确认；#58 未解决；待分配（Prologue 原生 Host） |
| [SYS-18](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L236) | 已有计划 | P3 | **恢复后的审查显示无法成功的批准按钮**。队列投影给出当前可批准性；重启、撤权后只展示有效操作及原因。 | BL-360；②（原工单） |
| [SYS-19](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L235) | 已有计划 | P3 | **已结束审查保留 authority 引用**。结算/过期后释放 authority；反复停启插件不会一直保留旧 caller。 | BL-359；②（原工单） |
| [SYS-20](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L237) | 已有计划 | P3 | **子任务整合拒绝依赖中文文案匹配**。声明有主人和类别的错误码；中英提示按码区分，拒绝行为不变。 | BL-361；②（原工单） |
| [SYS-21](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L238) | 已有计划 | P2 | **插件后台作业对用户的披露不完整**。安装确认和详情显示作业理由及权限；按现有工单验证中英展示。 | BL-362、BL-353、PG-002；②（原工单） |
| [SYS-22](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/apps/local-host/src/plugin-project-cleanup.ts#L80) | 待处理 | P2 | **删除确认不列出仅后台执行的插件**。删除预览告知会停止哪些后台工作；仍沿唯一删除服务，不能为提示新写已取消任务业务账。 | 新增验收；BL-362 只覆盖安装/详情；待分配（项目删除体验） |
| [SYS-23](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/repository-anti-corruption/privileges.md#L429) | 已有计划 | P2 | **Coding 尚未采用随激活作业 keep**。按 PG-038 迁 Coding 跟随者；取消调用、停插件、删项目分别按既定生命周期验证，并处理发送状态竞态。 | PG-038、BL-410；③（原工单） |
| [SYS-24](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/repository-anti-corruption/privileges.md#L206) | 已有计划 | P2 | **工作执行器协议已有，消费者尚未切换完**。按 C8-2/C8-3 接 Coding 与助理；真实派出、追问、重启恢复后不再依赖 Coding 私路。 | PG-036，C8-2 / C8-3；③（原迁移线） |
| [SYS-25](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/repository-anti-corruption/privileges.md#L104) | 已有计划 | P2 | **插件同等装配仍有剩余特权与旧读取**。按 privileges 原顺序完成 Goals/Assistant/Feed 等剩余项；逐一移除宿主点名和跨 owner 直读。 | W5-02 / T1、PG-105、PG-062/093 等；按 privileges 原负责人 |
| [SYS-26](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L156) | 已有计划 | P2 | **补充回执的重发去重仍缺真实链路证明**。截断真实 Host 的响应，同 key 重发；原 input_id、一次 provider 调用、一次记录和一次展示。 | BL-310 / QA-009；待分配 |
| [SYS-27](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/ai-input-receipts/spec.md#L60) | 已有计划 | P2 | **有效要求跨压缩、纠正和重启仍未完整验证**。执行摘要真实截止、跨 Run/重启/纠正及真实模型约束场景；迟到摘要不替换备用内容。 | BL-311、BL-317、BL-319；待分配 |
| [SYS-28](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/ai-input-receipts/spec.md#L1) | 已有计划 | P3 | **回执主线还有未实现的用户闭环**。延续 Goal 关联输入、交付说明其他入口、步骤板决策与阶段 5/6；按原依赖安排。 | BL-312～318；已完成项不重复做；待分配 |
| [SYS-29](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/context-program/spec.md#L1) | 已有计划 | P3 | **情境动作的后续创建与拖放未完成**。按现有 W4–W7 路线补 find、批量、内容站派生、拖放与 Shelf 入口；最终体验另验。 | BL-330～339；待分配 |
| [SYS-30](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L168) | 已有计划 | P2 | **多选列表还不能纯键盘完成选择**。按既定列表/treegrid 结构实现方向键、Space 与单 Tab 入口；不只验证鼠标 Ctrl-click。 | BL-340；待分配 |
| [SYS-31](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/horizontal/agent-host/src/adapters/prologue-run.ts#L149) | 已有计划 | P2 | **写后检查没有覆盖子任务，时间线未消费回执**。分两片接子任务自身目录的 executor、时间线的检查器/退出码/超时；沿 SDK 原审批链。 | BL-301、BL-302、BL-303；待分配 |
| [SYS-32](https://github.com/molis-ai/molis-work/pull/950) | 在途 | P2 | **大代码块与流式代码性能修复仍在分支**。先整理堆叠，再在合并结果验证长回复插入、滚动与着色；性能证据绑定提交。 | 已有在途视觉线；保留原视觉线负责人 |
| [SYS-33](https://github.com/molis-ai/molis-work/pull/981) | 在途 | P2 | **已删对象的跨入口恢复修复尚未落主线**。合入现有修复后，从结果侧栏、插件主区逐条验证准确错误、保留标题且不拿起不存在的对象。 | 已有在途；#984 是迟到 view 用例；保留原视觉线负责人 |
| [SYS-34](https://github.com/molis-ai/molis-work/pull/934) | 在途 | P2 | **页面语言尚未贯通全部插件错误响应**。按 #934/#936 完成 locale 调用链；英语请求的错误为英语，存储内容保留原文。 | #934 / #936；保留原视觉线负责人 |
| [SYS-35](https://github.com/molis-ai/molis-work/pull/970) | 待处理 | P2 | **在途 PR 的比较基线仍夹入大量已合变化**。整理 #934/#970 的 base 或 rebase；重新核真实增量及合并结果，不按祖先文件重复统计风险。 | 不是产品 bug；合并前审阅条件；原 PR 作者 / 合并负责人 |
| [SYS-36](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/visual-ui-experience/spec.md#L1) | 待验证 | P2 | **内部完整验收仍缺原生 WebKit 与完整主路径**。在允许的隔离环境执行关键中英/窄屏、键盘、首次使用、失败恢复及原生壳路径；分开记录工程、实操与本人验收。 | VUX、BL-319、BL-338/339；待分配（产品验收） |
| [SYS-37](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L172) | 已有计划 | P3 | **Alchemist/创作台去向应沿最新决定收尾**。防腐完成后先删 Alchemist 再删创作台；按既定备份和通用测试替换计划，之后重做。 | BL-376 / BL-377；③（删除）；重做待分配 |
| [SYS-38](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/docs/product-operations/产品介绍.md#L79) | 待处理 | P3 | **产品介绍与 Prologue Host README 有过时承诺**。同步创作台/Alchemist 最新定位、Host 已有写文件/进程能力；文档以当前行为与目标等级表述。 | 此前复查；与删除实现分开承接；待分配（对应文档 owner） |
| [SYS-39](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/apps/local-host/src/web-server.ts#L211) | 待处理 | P3 | **宿主异常诊断和事务原错误保留仍可改善**。统一安全错误响应并记录可定位信息；rollback 自身失败时保留原操作错误，勿新增复杂框架。 | 此前复查；未实证敏感值泄露；待分配（local-host） |
| [SYS-40](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L1) | 已有计划 | P2 | **资料对话框关闭不取消下载和转写**。取消贯通 Host 下载/转写任务；关闭后不得继续保存新版本。 | BL-398；与 SYS-02 的项目删除队列问题不同；待分配（资料导入） |
| [SYS-41](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/specs/BACKLOG.md#L1) | 已有计划 | P3 | **助理知识能力开关缺直接验收**。从真实助理能力目录调用 knowledge；关闭一项后不能再获得该项。 | BL-396；待分配 |
| [SYS-42](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/docs/system/SECURITY-INVARIANTS.md#L89) | 待验证 | P2 | **本机多用户和跨 Home 读取承诺需验证**。先写清 OS 用户/Home 隔离承诺，再用两个账号及独立 Home 验证；不要仅换 cookie 便宣称完成。 | S-44 与已有安全说明；待分配（平台安全） |
| [SYS-43](https://github.com/molis-ai/molis-work/pull/931) | 已核验 | — | **Coding 翻译 #922 / #931 已合入**。本项关闭；服务端 locale 与测试夹具分别见 SYS-34 / SYS-10。 | 不再按旧复查列未合入；原 PR 负责人 |
| [SYS-44](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/packages/plugin-runtime/src/project-database-statements.ts#L119) | 已核验 | — | **项目库表归属与读写拒绝已有实质保障**。保留逐句检查与 SQLite 版本约束；不要因缓存开销推断删掉守卫。 | #903；Home 事务问题另见 SYS-06；原平台线负责人 |
| [SYS-45](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/packages/plugin-runtime/src/activation-jobs.ts#L84) | 已核验 | — | **委托和随激活作业有明确身份边界**。保留原调用者检查与安装生命周期；不要把已定 workflow audience 或调用取消后作业继续误报为越权。 | S-43 / S-52；原平台线负责人 |
| [SYS-46](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/apps/local-host/src/workspace-git.ts#L53) | 已核验 | — | **只读 Git 不执行仓库 helper 的修复已落地**。保留 status filter、fsmonitor 与子模块边界；写操作仍按人审执行。 | S-53；原平台线负责人 |
| [SYS-47](https://github.com/molis-ai/molis-work/blob/6d2361652bd167d07815d930cd04f802967292a3/horizontal/agent-host/src/adapters/prologue-after-write.ts#L55) | 已核验 | — | **写后检查主轮与多图顺序修复已进入应用**。本项仅确认已完成范围；子任务/时间线见 SYS-31，后续换包见 SYS-13。 | 不将已完成路径再列为新修复；原采用线负责人 |

## 验证与结果

每批整体 `pnpm build` 后跑定向回归，非浏览器 `--jobs 2`。共享核心、存储、跨包及最终收尾跑全量；现有机器槽位安排构建与浏览器批次。隔离 Home、公共 test-kit、独立测试浏览器，不触碰真实 Home。

第一组定向：`node scripts/run-tests.mjs --jobs 2 tests/knowledge-cards.test.ts tests/knowledge-reads.test.ts tests/knowledge-http.test.ts tests/knowledge-service.test.ts tests/security-invariants-knowledge.test.ts tests/project-deletion-service.test.ts`，并加入新的正式交错回归。最终运行 `pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、相关 API/动作快照、`git diff --check`。没有外部发布授权时全量在本地隔离树执行。

### 资料并发与删除（2026-10-21）

- SYS-01：每份发送前重读来源和卡片；等待第一份时排除下一份、移除其来源或改成仅摘要，下一份均不调用模型。正式交错回归 3 种；HTTP 回归通过真实 Host/SDK 的网络请求验证排除。
- SYS-02：删除钩子先让 organizer 的项目失效并取消模型，再清库。真实删除入口切断正在等待的模型 HTTP；删除前实际存在的卡片、用量、读取回执均清空。忽略取消的 writer 晚到、重复 kick、reconcile 和 quota confirmation 也不重建记录。
- SYS-03：把授权等待移到预算读取之前；从读取余额到写回执、扣额度之间没有 await。6 次同轮 read 与混合 read/grep 共返回 60000 字，余额依次 48000/36000/24000/12000/0/0；拒绝授权不留回执、不扣额度。
- `pnpm build` 通过。第一批 7 个文件 65 条通过；补强后的 cards/lifecycle 两个文件 18 条通过（总覆盖新增 1 条）。日志在本机 `/tmp/system-review-knowledge-tests.log`、`/tmp/system-review-knowledge-extra.log`。
- 未改变公开 action/Manifest/schema；KnowledgeWriter 的内部端口新增可选 AbortSignal，Host 向现有模型取消链传递。模型回复是固定本机替身，未进行真实模型理解与本人验收。跨包全量留到本轮收尾，不能据定向结果宣称整个任务完成。

不沿用报告中的探针为通过证据。真实模型理解、原生 WebKit、双 OS 账号与一骏本人体验只按实际覆盖记录。

### 后续修复方案

SYS-22：沿唯一删除服务显示仅有后台工作的插件，文案明确“将停止”，名称从 Manifest 来；取消语义与不留失败业务账保持现行要求。SYS-39：未处理的 HTTP 失败用稳定通用消息和调用诊断 id 回应，hostLog 只记录安全错误类型/码；插件事务 rollback 的次级失败单独记录，调用者仍收到原操作错误。

SYS-14：桌面用一次性随机 challenge 与 Home 控制密钥的 HMAC-SHA256 验证本次 health 原始 JSON；严格检查 HTTP 状态、长度、结构、status 和 desktop_tui，密钥不发给未验证服务。调用自定义原生命令前也做身份检查；原生后台 HTTP 在同一 TCP 连接先验证、再发送控制令牌和内容，避免验证后换端口进程的窗口。移除无页面消费方的原生 PTY 命令、权限和实现；工作台现有 WebSocket PTY 保留。Rust 负向测试使用临时随机端口，不占真实 4173。

### 流式文字、键盘与状态（本地提交 387a045a8）

SYS-04 同帧混合文字连续更新的生产浏览器回归通过；SYS-07 通用 tabindex 工具栏真实方向键往返通过。旧 stream-text 的规格板用例在现行 main 找不到 data-catalog-stream，原断言保留，基线对照尚待完成，不能据新增回归将全文件记绿。SYS-08 两种把手均由真实键盘进入并显示焦点，编辑器不再拦截把手的 Tab；Pages 两条浏览器用例通过。SYS-09 目录的取消统计分开，生产状态投影与胶囊回归通过。SYS-12 model-vision 完整浏览器路径通过，原图片上传、持久化和调用断言保留，只更新现行标签。

SYS-10 的三份词典夹具与 SYS-12 companion 的 L 参数已在 #934，保持在途归属；SYS-11 已在 #968。包资源实测均未增加，page-assets 与 health --base origin/main 通过。没有因此宣称视觉产品全体验验收。

### 首页聚合、Home 事务、删除预览与诊断

SYS-05 的真实 Host 提供方挂起与取消测试通过：其他结果在截止后可返回，超时信号到提供方，迟到结果不修改快照。SYS-06 的真实 SQLite 事务回归通过，CTE 写入不能经 get/all 绕过，事务内只读仍能读刚写的行。SYS-22 删除预览列出仅后台工作的插件并支持中英名称，真实删除仍取消作业、隔离其他项目且不写迟到结果/失败账。SYS-39 HTTP 故障注入返回通用消息、稳定码与诊断 id；原私有路径不出现在响应或安全日志，rollback 故障不会掩盖原操作错误。相关定向文件通过，整批全量留待最终收尾。

### SYS-15 全页面隔离依赖（2026-10-21 补充授权）

一骏明确选择「本轮接管必要依赖，完成全部页面隔离」。本轮因此接管隔离需要的终端、工作区和跨界面服务迁移（涉及 PG-053/082 的必要部分）；既有路线的无关项目仍归原负责人。目录选择与绑定已经实现，不能据此宣布 SYS-15 完成。下一步先以 Cognia 做高保真隔离切片，再推广到 Home/项目主区、侧栏、设置、安装插件视图；保留当前使用路径和异常恢复。任何页面到宿主通道都由宿主持有实际页面实例、安装及项目身份，不采信页面自报身份，也不提供可转发任意 Host HTTP 的后门。终端只获得会话句柄，项目目录选择由可信宿主完成；插件的同源父 DOM、控制令牌和原生 IPC 均不可达。

目录实操发现的调用链缺陷：Cognia 在项目请求中调用自己的 scan 动作时，`PluginActionClient` 把嵌套调用退回 Home 的空项目，导致正确绑定的 grant 被拒绝。改为从 Runtime 捕获的外层调用继承项目与 actor（不是从插件提供的 control 字段读取）；最外层 HTTP 仍由 Host 绑定的 route control 定身份。按真实项目导入链及跨项目/actor 拒绝回归验证。

页面通道实现合同：可信外壳保留控制令牌，插件 HTML 与脚本只在 `sandbox="allow-scripts allow-forms"`（同时以 CSP `form-action none` 拒绝原生表单导航） 的不透明来源 iframe 中运行。每个 frame 使用独立 MessageChannel；连接只由外壳交给实际 frame，不按消息中的插件名分配。Host 给外壳的页面授权绑定实际激活、安装、项目和调用者，插件重启、撤权、项目删除或页面关闭均让旧授权失效。HTTP 转发只允许 Manifest 声明的自身路由及明确的宿主服务，原生 IPC、其他插件、管理入口、任意路径与项目切换均拒绝；嵌套动作继承项目与 actor，但保留插件自己的 grants 与 allowed_actions，不能扩大委托范围。

SYS-15 验证须覆盖：真实恶意页面读取父 DOM/控制令牌/原生 IPC、调用其他插件/项目/管理接口、重启后继续调用，以及导航到宿主页面；均实际拒绝。正常导入的系统选择、取消、预览、提交、重新打开及异常提示保持可用。共享客户端的流式响应、取消、主题、键盘、选中事件与草稿持久化通过受限通道保留；各旧插件迁移后逐类验收，未迁移页面不得记为完成。

2026-10-21 补充资源授权：一骏已允许新增 `/assets/molis-work-plugin-frame.js`，并按最终实测值登记一次性放行、冻结预算。提问时实测 90,325 字节；这个数是当时实现的测量值，不是最终值。其他资源仍按原预算规则处理。

终端迁移保留现有 PTY 与录制 owner。Runtime 的真实服务端调用创建面板时记录安装、项目和 actor；页面只通过宿主持有的 socket 连接这些已创建的面板，不能传命令、cwd、环境或 session 身份。页面关闭/撤权后的控制和输出再次复核权限；断线重连只 attach，不重新派发。`security-invariants-plugin-terminals.test.ts` 已用实际 `/bin/cat` 和 WebSocket 验证输入/回放、跨插件/项目拒绝、服务端抢占拒绝、页面关闭后拒写与重新打开恢复、显式停止。Character 前端已接新通道，浏览器验收尚待执行；Work/Shelf 的服务端创建路径仍待迁移。

隔离页面的确认与文本输入采用公共 `host.confirm/prompt` 异步对话框，沿用现有组件样式、键盘和焦点恢复；页面关闭时取消，原生浏览器弹框不作为插件依赖。已具有自身 HTML 对话框的插件继续使用原实现。

终端渲染由平台公共 `host.terminal.mount(element, { panelId, onEvent })` 提供，按需加载现有终端资源。挂载只连接已授权面板；返回 focus、fit、dispose，卸载只释放视图，不终止进程。输入、尺寸、回放、断线及主题由同一组件处理，插件保留自己的记录选择与状态文案；公共 SDK 只导出合同类型，不依赖 xterm 或私有包。逐步替换 Work、Shelf、Character 的重复渲染，最终删除旧客户端的宿主直连。

2026-10-21 页面切片验证：Cognia 1440/390px 的目录选择取消与导入、AI 草稿、固定引用、重命名来源、删除取消与确认、模型停用通知四项实际浏览器场景通过。Character 的真实测试进程已验证键盘输入、关闭并重新打开后的回放、幂等会话、停止后不重启以及保存输出。设置页原来的宿主定位标记由外壳保留，内容仍在隔离 frame。21 个注册客户端的逐页检查发现创作台、Schedule、Shelf、Alchemist 尚缺接入，以及 Coding 缺共享滚动组件；这些仍是本轮未完成项。

### SYS-15：Schedule 旧入口的必要切换

Schedule 现有动作处理器、数据库和 Scheduler 服务保持同一份实现，动作注册迁到项目 Plugin Runtime。HTTP 只保留 Manifest 声明的插件命名空间，页面刷新改用公共 `UiPageView.readDocument()`：宿主固定读取当前页面并只返回该贡献的惰性 HTML，读取前后都复核当前页面授权；子页不能指定地址或贡献身份。此服务用于原有服务端投影的刷新，不暴露宿主整页、令牌或其他插件内容。原任务新建、编辑、暂停、恢复、归档与提醒归属确认行为继续保留，真实浏览器验证持久化后刷新和重开。


Schedule 隔离动线已在真实浏览器通过（新建、编辑、暂停、重开、恢复、归档）；窄屏提醒恢复与结果未知的操作恢复也通过，包含取消、重装后过期确认拒绝、刷新失败不提交新身份，以及重新确认后的持久化结果。已有后台作业回归在执行。旧路由被移除，公开地址改为 `/api/plugins/io.molis.work.schedule/*`；任务动作 id/schema 不变。旧路由表测试改用 Runtime 的 Manifest matcher，HTTP 字节预算测试改走真实 Runtime 入口。

2026-10-22 一骏明确决定：后台依赖也彻底迁完，不调整门禁。删除 Schedule 的宿主专用装配；公共调度、安装查询、后台 Agent 与投递能力必须按声明服务所有插件。页面隔离与全面后台去耦分别验证。


#### SYS-15 调度迁移的事务边界

任务与闹钟分别由插件和 scheduler 持有，保存、暂停、删除必须原子提交。公开 `services.scheduler` 只读写当前安装所属插件的闹钟，写入用 `join(project_database.transaction 的句柄, write)` 加入当前项目库事务；句柄不可伪造、不可跨插件/项目/激活、不可在事务结束后复用。平台保留连接，插件拿不到 SQL 连接或其他表。调度器对正在执行任务的取消延后到提交后，回滚不取消原执行。现有同步业务 store 可在该事务里复用，异步 Agent 执行在事务外。

- SYS-15-S1：真实 Runtime 插件事务同时保存业务记录与闹钟；抛错、异步写体、撤权和取消均整笔回滚，停用后所有句柄失效。
- SYS-15-S2：伪造、结束、另一插件与另一项目的事务句柄均拒绝；job id 不能读写其他插件的闹钟。
- SYS-15-S3：暂停、替换、删除在回滚时保留原执行，提交后立即取消；随后 tick 不重复执行已暂停任务。

唤醒动作、安装身份与授权、后台 Agent、提醒投递逐项接入公共合同后，Schedule 工厂才移除原始数据库与宿主端口。保留现行提醒恢复与未知结果人工决定语义；不增加兼容读取，不降低门禁，不迁移真实 Home。

#### SYS-15 唤醒身份与项目库版本

调度器保留闹钟与执行租约；新表 `schedule_action_bindings` 只记录闹钟对应的安装 id、安装世代与动作版本，由 scheduler 唯一读写。项目基线从 v8 升到 v9，旧库仍拒绝，不在读取时迁移；一次性维护与备份先在临时 Home 演练，真实 Home 不在本轮授权内。插件在 `background.wakeups` 声明自己的动作与原因，平台验证其确实提供给 plugin audience。注册时和投递前都核当前安装、权限与动作版本；暂停、撤权、卸载后不取走到期任务、不写失败回执；替换安装后旧绑定需要明确恢复，普通 Host 重启沿原世代恢复。投递经过现行动作网关，取消随执行传到 Agent 和模型。

- SYS-15-S4：到期动作来自真实网关、带原安装与项目身份；缺少声明、授权、动作不匹配及另一安装均拒绝。
- SYS-15-S5：停用、撤权、版本或世代变化时到期任务保留，正在运行的动作取消且不写迟到结果；重开同安装可恢复，新安装不能自动接管。
- SYS-15-S6：v8 库拒绝；临时副本维护到 v9 后业务数据保留，老闹钟的恢复必须有明确授权，不从旧行猜身份。

SYS-15-S1～S5 的现有路径已通过：真实 Runtime 事务、网关唤醒、停用与重启、重装后的明确恢复、运行中取消且不写迟到业务/回执；共 7 条定向回归。原 scheduler 23 条、项目基线 6 条通过（`/tmp/system-review-scheduler-actions-5.log`）。原项目库隔离 16 条、Home 分区 12 条、激活作业 16 条与 Manifest 12 条也已通过对应定向回归。后续证据见下文；此处是首轮公共服务验证，不能代表整体完成。


#### SYS-15 公共后台 Agent

`services.agents.run` 接受本插件已声明的 role、任务、标题、可选工作区 id 与不超过十分钟的时限；Host 派生项目、安装和操作者，沿用同一 Home 的 Prologue、项目提示与公共记忆策略。只在声明 `agent:run` 的 concurrent command 或已保留的后台 job 内调用。返回完成正文及会话/运行引用；等待审批、等待输入、超时、取消、停用或撤权均取消本次自己创建的运行。插件拿不到其他运行的控制接口，也不能在调用结束后留下无人管理的 Agent。

- SYS-15-A1：实际 Runtime 动作经过公共服务运行已声明角色，身份和工作区由 Host 冻结，返回模型正文。
- SYS-15-A2：缺权限、未声明角色、只读或串行动作、外部调用及另一项目 scope 拒绝，未启动模型。
- SYS-15-A3：原动作取消、停用、超时或等待交互取消对应运行；启动前撤权不留运行，迟到响应不写插件业务结果。

公共 Agent 首轮真实 SDK/本地 HTTP 回归通过 5 条：正常结果与安装身份、缺权限及调用类型拒绝、取消、停用、超时；后面三项均验证模型请求断开且业务表零写入。原失败来自测试 teardown 顺序（Home 先关闭，外部测试平台后停止），已改为平台先清理。日志 `/tmp/system-review-plugin-agents-4.log`。跨项目借用与等待人工交互的额外验证在继续，后台整体迁移仍未完成。


公共 Agent 的跨项目借用拒绝和真实 `ask-user` 等待交互取消也已通过，累计 7 条；调度事务/身份 7 条同批通过，日志 `/tmp/system-review-plugin-agents-5.log`。

#### SYS-15 安装查询

`services.installations` 按 `plugins:read` 声明给出当前激活所在范围的安装 id、世代、版本、发布者、名字与状态；不公开授权、签名、入口或私有路径，不查询其他项目。安装事实每次从 Runtime 仓库读，名字取当前已登记 Manifest 或同版本已存发布物；关闭、撤权、外部项目与其他安装借用服务时拒绝。Schedule 用这份公共查询核提醒/操作归属，不再由宿主替它直接访问 Runtime 表或 Builder 数据。

- SYS-15-I1：原生和另一 Runtime 平台的安装共用同一项目目录，暂停/卸载/重装状态与世代立即反映；不同项目隔离。
- SYS-15-I2：缺声明/授权、另一个安装或项目借用、停用后保留的句柄均拒绝；返回结果只有公开字段。

#### SYS-15 公共通知投递

`services.notifications` 需要 `notifications:write`，将本插件的通知加入当前项目库事务。输入为通知去重键、标题、摘要与正文；项目、来源、插件和安装身份均从平台派生。跳转目标默认本插件，也可指定当前项目中已安装插件的 id；宿主核对后生成固定页面地址，不接受任意 URL。通知与业务消费一起提交或回滚，不接收其他插件的来源身份。返回的投递回执只有提交后才能 `settle()`，沿现行 Feed/Inbox 场景完成后续判断；判断失败不撤销已投递通知，停用、取消或撤权后不启动新判断。调用方等待回执，平台不遗留无人管理的后台任务。

- SYS-15-N1：真实 Runtime 的业务写与通知同笔提交；重复键不产生第二条，抛错/异步写/取消时两者都回滚，回滚回执不能启动判断。
- SYS-15-N2：其他安装/项目/结束事务/伪造句柄、只读或缺权限调用拒绝；身份由平台给出，停用后回执拒绝，收件箱内容仍是已提交版本。

2026-10-22 一骏确认 Schedule 采用统一生命周期：默认启用，停用时页面、对话任务、提醒与定时操作一起暂停；重启同一安装恢复，新安装仍按身份确认规则处理。删除“关闭页面仍由宿主后台继续运行”的旧行为。

#### SYS-15 插件自身授权的动态动作调用

既有 `actions.directory` 代表当前人的授权，只能在非 plugin 受众的原调用内使用，不能借给定时任务。新增公共 `actions.dependencies`（声明并持有 `actions:invoke`）从真实目录发现和调用当前项目中面向插件的动作，始终用本安装身份与自身 grants；不继承人的权限、不改成 workflow 受众。服务只在当前安装的动作或保留作业内使用，调用前后核查激活与权限，查询上下文只能调用查询。动作可声明 `local_id` 表示提供方内部的稳定功能名；Schedule 仅在同一个真实插件提供方中解析这个名字，歧义拒绝，实际调用固定目录给出的 capability/version/provider。创作台发布的功能将既有 operation id 声明为 local_id，从而保留已发布 `schedules.add` 的调用含义而不访问 Builder 的私有发布记录。

- SYS-15-D1：任意 Runtime 插件用本安装授权发现并调用已公开的目标；真实网关记录原项目、安装和 plugin 受众，无法获得 user/workflow-only 或缺权限动作。
- SYS-15-D2：未声明、跨安装/项目借用、外部调用、只读调用写动作、停用/取消/撤权和失效版本均拒绝，不写目标业务结果。

统一停用的实现必须覆盖项目启用事实到 Runtime 激活的连接：现行可用性过滤本身不停止后台。项目中的 Runtime 插件共用已存在的 Supervisor revoke/enable；设置操作返回前撤销当前激活，重启从项目启用记录恢复。没有打开页面时也先装配 Runtime 后运行项目时钟。此项随 SYS-15-S2/S4 和无页面调度回归验证，结果见后续记录。

SYS-15-D2 实测发现：Runtime 的只读传播只看 caller 标记和 Scene 声明，没有纳入当前动作的 query 声明，普通查询能通过新动态目录执行写动作。修复公共只读判定，让数据库、调度、投递和嵌套调用统一继承当前 query 声明；保留查询读取未来命令合同的能力，但拒绝执行命令。新增真实 Host 的查询转写负向回归，投递负向回归使用 concurrent query，避免仅由串行动作限制间接通过。

- SYS-15-S7：新项目以普通 membership 默认启用 Schedule；项目停用设置返回后，当前 Runtime 激活、页面授权、定时执行与保留作业都结束；重启保持停用，重新启用复用原安装与任务。现有项目不在读取时自动补启用。默认项从产品注册声明传给 Projects 的通用初始成员接口，无 Schedule 专用 Host 判断；不是不可关闭的 always_on。

2026-10-22 定向证据：公共动态依赖 5 条、通知 4 条、调度 7 条、已有查询委托 20 条通过；v8 维护 6 条与新增 v9 维护 2 条通过（`/tmp/system-review-runtime-readonly-1.log`，其中误写的 `plugin-project-library.test.ts` 文件不存在，未记为通过，改跑实际安全项目库测试）。v9 只在临时目录演练，保留任务、对话与历史，旧闹钟暂停且没有补造安装绑定。Schedule 任务动作 HTTP/Host/MCP 1 条与就绪检查 8 条通过（`/tmp/system-review-schedule-migration-3.log`）；统一停用与新项目默认启用的后续修改另验。

2026-10-22 身份路径核对：提醒和定时操作的创建者取网关验证过的 `plugin_install_id`，再经公共安装目录取得 `plugin_id`；不能从 `actor_id` 的字符串前缀推断。内置、外部与创作台插件均走这一合同。补充 SYS-15-D1 实例验证：使用普通用户 actor 的真实 Runtime 插件也能登记自己的提醒和操作，伪造安装仍在网关拒绝。

SYS-15 后台卸载收尾：安装目录的 `list()` 只返回未卸载条目，`get(id)` 保留该范围内已卸载安装的最小元数据，便于事实 owner 区分“已明确卸载”和“记录缺失待确认”。Schedule 在自己的保留作业中清除已明确卸载安装的提醒、操作和闹钟（最多一个现有 5 秒整理周期；Schedule 停用时随重新启用收尾）；卸载一经生效即禁止后续派发，不依赖清理是否已运行。没有安装记录或世代变化的历史任务仍走明确恢复，不当成卸载删除。

SYS-15-S5 崩溃窗口补充：公共动作闹钟不在进入动作前消费到期点；运行中靠现有 lease 独占，动作结束且身份仍有效时再提交 cadence/一次性消费和技术回执。进程若在 claim 后、插件准备前退出，原到期点仍可恢复；若业务已派出，插件原有 running/unknown 记录阻止自动重放。直接处理器调度的已有事务准备路径保持原合同。用真实公共 Runtime 的子进程 claim 后强制退出验证重启恢复。

SYS-15-S5 驻留关闭回归发现：公开唤醒动作计入 LocalHost 的 activeUses，项目 close 等其结束后才关闭 scheduler，而依赖动作一直等待外部结果。项目关闭信号必须在进入 closing 时传给注册为 concurrent 的动作和既有 wait，取消后仍等待受控处理器清理再释放库；串行提交路径保持原顺序。通过实际驻留 timer + 延迟依赖验证服务关闭、项目关闭与删除均取消，业务结果/通知/成功回执均不迟到。

2026-10-22 驻留与恢复证据：`schedule-operation-recovery` 与 `schedule-reminder-recovery` 共 7 条通过（`/tmp/system-review-recovery-3.log`），包含真实 Runtime 的恢复、过期确认、原子回滚与窄屏操作。`schedule-resident-runtime` 5 条通过（`/tmp/system-review-resident-4.log`），覆盖未打开页面的持久任务与新登记任务、服务关闭、项目关闭、删除以及准备阶段取消；没有迟到业务效果、通知或成功回执。旧 typed Schedule 通道、六个 Schedule 专用宿主文件已删除；公共 API 快照已更新，最终整组回归仍在执行。

2026-10-22 Schedule 整组回归：18/18 文件、121 条测试通过（`/tmp/system-review-schedule-complete-1.log`），涉及任务、提醒、定时操作、统一停用、投递、typed 入口撤除以及五项公共服务的拒绝路径。结构门禁对照 `origin/main` 的 merge-base 通过（`/tmp/system-review-health-25.log`），没有调宽门禁。全部页面隔离和最终全量仍未完成。

#### SYS-15 剩余页面收口（2026-10-22 用户澄清）

一骏明确要求“不要做防腐本身的事情，只做PR和评审问题”，随后澄清“已经做了的不用撤回”。保留 Schedule 已授权并验证的后台迁移，恢复已做的 Shelf Home Runtime 改动；不再扩展 Alchemist、插件创作台的后台迁移或提前下线。剩余工作以 SYS-15 页面权限隔离、已做改动的正确性和回归验证为边界。

Shelf 保留原个人文件位置，以公共 owner files、模型、材料和动作服务装配 Home Runtime，项目实例通过同一插件动作交付成果副本。首次示例在初始化阶段创建；页面只走自己的受限路由。已完成实现不等同于验证通过。

- SYS-15-F1：真实 Home Runtime 导入、读取、编辑、提取、模型生成、取消与重开保留个人副本，项目之间共用 Shelf；初始示例不被查询补写。
- SYS-15-F2：隔离侧栏与设置可操作；页面不能读宿主 DOM、令牌、其他插件路由或用自报路径取得原生文件操作。
- SYS-15-F3：终端只连接可信服务解析的、属于当前页面身份的面板，重连不重复启动，失败保留未发送文字。

SYS-15-F2 原生文件交付：子页面只提交 owner files 内的相对路径；可信父页经当前页面授权向 Host 解析，核声明、当前授权及无链接文件，再调用既有桌面复制/拖出命令。子页面没有 IPC、绝对路径选择权或其他安装文件访问权。纯浏览器仍下载副本。

未采用 Runtime 后台的现有页面（Alchemist、插件创作台）仅登记页面需要的具体 method/path，仍经现有业务路由，不迁移后台。页面授权没有安装 id，不可使用目录、动作代理、终端或 owner files 服务；每次请求复核项目显示状态，过期、关闭或删除后拒绝。Alchemist 路由直接从自身 Hono 注册表取得，创作台登记八个现有入口。

2026-10-22 页面收尾证据：剩余 Shelf、Alchemist、插件创作台三页真实隔离打开通过（`/tmp/system-review-remaining-pages-1.log`）；页面权限 9 条与文件交付 1 条通过（`/tmp/system-review-pages-boundary-4.log`）。终端实际程序、限定目录、重复连接与撤权清理通过（`/tmp/system-review-shelf-services-2.log` 的 terminal 两条）。生成插件试用与安装页复用同一隔离载体，验收浏览器改为 DevTools 进入实际子页面，仍待完整动线验证。

创作台页面隔离保留安装后的打开与卸载后的外壳更新：通过公共页面视图请求刷新当前外壳（不接受地址）；打开尚未出现在外壳中的插件时，由外壳在当前项目地址重新读取并打开指定 surface。插件页不自行操作父 DOM。预览和已安装插件的调用继承页面信号，关闭或失效后不得提交迟到存储。


Shelf 的模型可用性保留设备里明确选择的模型：Runtime 在同步只读作用域执行动作 availability，允许读取当前调用者有权访问的插件自身文件；写入、模型执行和回调结束后的访问均拒绝。不能因可用性查询直接写业务数据，也不能把无效的明确选择替换成默认模型。SYS-15-F4 用真实 Runtime 验证设置变更后的发现结果与拒绝，以及只读回调无副作用。

SYS-15 页面共享交互回归补充：隔离页面经绑定 MessagePort 上报选区、落点和声明式编辑工具，工作台继续拥有工具栏与候选排序。平台固定真实插件身份与页面位置，并转换有限的屏幕坐标；页面不能借事件取得宿主 API、令牌或 DOM。已点击动作仅提供本页面、这次选择绑定的 prepare/run 回调，拒绝未知或失效句柄；写回调只运行一次，页面关闭时取消等待。插件自己的编辑面板留在隔离页面，按原合同使用本地定位的退路，不将可执行 DOM 搬进宿主。
- SYS-15-U1：Pages 在隔离页面内真实创建、编辑、选择文字，通过共享工具栏生成候选，确认后落库，刷新恢复并保留冲突草稿；同一桥保留声明式工具、落点提示和宿主变更通知。
- SYS-15-U2：子页面不能自选 API、callback 输入或另一个页面的句柄；未点击、已关闭、撤权、重复确认和迟到结果不造成越权或重复写入。
