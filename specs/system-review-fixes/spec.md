# 系统评审问题修复

状态：执行中（2026-10-21），负责人 Codex。目标是可审阅、经过验证的本地修复；工程通过、真实场景与一骏验收分别记录。写入尚未结束。

本轮接续系统评审的 SYS-01～47。Work 基线 `6d2361652bd167d07815d930cd04f802967292a3`，Prologue 基线 `95e177093a4efb60a286272892a89dc1e7ed31ba`，均已 fetch 核对。原 `pr-review-remediation` 的 PRR/QA 任务及主检出的未提交材料保持原归属。本 spec 是本轮 SYS 行为修复与逐项去向的唯一记录。

## 范围、方案与依赖

先修资料整理与并发额度（SYS-01～03），再处理流式文字与当前行为/测试缺陷（SYS-04～12），最后按真实信任边界处理桌面、目录与 Prologue 原生 Host（SYS-14～17）及其余确认项。原产品路线沿原 spec 和负责人推进；在途修复核对后关联，不复制实现。报告中的探针只用于根因定位，正式回归调用生产路径并控制真实异步交错。

第一组：`horizontal/knowledge` 每次发送前重新读取卡片和来源；项目删除使队列与运行中模型调用失效，清库后拒绝迟到写入；`apps/local-host` 把删除钩子接到这份生命周期。read/grep 在授权复核之后、同步分配额度并记账，避免 await 间隙让多次调用花同一份余额。失败的授权不消耗额度、不留回执。不改提示词、存储结构或用户额度。

第二组按对应包现有行为最小修复，翻译用真实词典验证，不降低原断言。安全组先核现行可信身份与用户授权入口，不增加历史兼容或特殊插件通道。上游源码修复、换包、消费者验收分别记录。

本轮不推送、不开 PR、不合并、不发布、不发送其他 chat 消息。实现阶段由本 chat 写入；清理 chat 先只读。原视觉线在途文件保持其归属：实现前看真实 base/head 增量，交叠只做必要独立修复。开放 PR 快照已核对：#934/#970 对 main 展开 354/451 文件，#936～986 多数是堆叠；#968 承接 SYS-11；上游没有开放 PR。

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
