# A 就地预览：资料引用与消费者接入

状态：实施前合同设计（2026-11-09），Agent 加密轮次索引升级范围待用户决定，其余沿已批准的 A 与 Files 退役范围准备；尚未实现或通过最终合审。

本稿细化[共享工具与迁移需求书](spec.md#3-files-退役的系统产生者合同)，不代替[同步切换与旧设备恢复合同](sync-cutover.md)。只读设计基线 `9e8583022`。沿用用户选定的 A、WMD §8、SSC-28 及 BSH-05–08、13、14。侧栏原位预览，Coding 执行主区保留，选择器宽屏并排、窄屏分步。「展开到主区」「回到执行」按 A 原型。高保真中的 186 KB 日志是布局样本，大文件验收须实际超过现行 256 KiB 分段阈值。

## 1. 共用引用读取和 Goal 输入

- 在计划中的平台资料动作 owner 下提供一个精确的 `materials.read` 入口，输入 `MaterialRef`，支持只核身份的 `head` 和有界的 `text`。结果含 owner 规范化的引用、显示信息、读取版本或明确的不可比较状态；正文只随 text 返回。所有分支从 ActionExecutionContext 取项目、操作者、调用插件安装和同意。源内权限由现有 owner 检查，交付前再查调用与来源的实时授权。来源错项目、错个人、已撤权、错版本均拒绝。
- `pin.current` 走现有知识对象或工作区 owner，提供真实 `read_revision`。`pin.fixed` 走成果库指定 id+版本读取，保留现有固定成果语义。`pin.snapshot` 经 Runtime 项目版本 owner 按 id+版本读取过程项，核系统 producer 登记及声明的 snapshot/selection 类型和 schema、个人 owner、源 subject、range、正文摘要。迁移的版本也须通过同一检查。选区过程项已存选出的正文，按保存的原范围验证后直接读正文。已捕获版本依自己的当前授权读取，源目录后来消失时仍可准确解释其出处。当前资料的活动授权单独检查，固定读取遇不到目标时返回明确错误。来源解释走 `material-origins.ts`，将 snapshot 分支提前到活动目录筛选前，只交付获准的出处，不暴露已失权路径。
- Goal 活引用维持 `goals.inputs.bind@1` 的 subject/title 分支，按 SSC-28 补可选 `read_revision`。SHA 存成 `snapshot_digest='sha256:<hex>'`，size 或旧缺值保留 null，显示「内容没有核对」。活动内容改变显示 changed 并仍可读。对象经 Placement 放进 Goal 的现有 `goal_in/used_in` 链继续适用。
- 同一绑定动作增加互斥的 `{goal_id, ref: MaterialRef<snapshot>, title?}` 分支。Goal 先通过真实 owner 验精确过程项及摘要，异步读取在 SQLite 写窗外；`beforeEffect` 后同步窗重新确认 Goal 可操作及此次 exact source 的实时许可，复用已登记的 Goal 自管窗方式。复用 `input_bindings` 的 `source_type/source_ref/snapshot_digest`，固定过程项以新的明确 discriminator 和规范 JSON 完整保存 ref、范围与 owner 验证的摘要，同一 ref 幂等，版本/范围不同可并存。list/撤下、Goal 输入 UI、复制/同步保留该形状；活动目标对象列表仍按活动 subject 运作。现有 `artifact_inputs` 继续保存真正的成果库指定版本。新 discriminator 不改表形、旧行原样；Goal owner 核同步校验及同版本接收语义，按当前合同流程登记，若有在外已发布协议硬约束则交主台判定。
- 取定版本或选区由统一 capture owner 读源、提交并返回精确 ref。若入口同时明确发布 before/after/selection，按 BSH-05 同事务提交过程项、端口和事件，提交后评估消费者。只选引用时不额外改端口。两项动作都需重查撤权和取消，失效后零业务写与交付。

现况定位：`plugins/native/goals/src/input-actions.ts:41,65,120`、`plugin.ts:24,85`、`project-database-goals.ts:175`、`module/replication.ts:36`、`http/deliverables.ts:38`；`horizontal/placement/src/index.ts:130`；`apps/local-host/src/material-origins.ts:103`；`packages/contracts/src/platform/project-materials.ts`；`specs/shared-sources-and-surfaces/spec.md:278,699`。

## 2. Coding 草稿、轮次和临时 worktree

- Coding 选料从 kind/id/title 改为完整 `{ref,title}`，按精确引用去重。草稿仍用 Runtime 的 `materials:<sessionId>`，独立选料 CAS 走该 key 的现有 revision，文本 autosave 使用已有 CAS。请求、待运行队列、委派、执行入口逐跳保留 pin/range；排队时将有效选择意图带入当前队列记录，真正启动时经资料 owner 读取，当前引用可重读且记录这次实际版本，固定/选区读确切版本。现有条数和模型文本预算继续生效，显示实际纳入、裁剪和省略的材料。来源找不到、授权撤回时保留用户原草稿并标具体项，用户可移除或重选。成功启动后显示该轮读取结果，继续新轮才会重新解析活引用。
- `materials:`、`queued:` 位于 Runtime 的项目 `plugin_private_values`，与 Coding 自己的 v1 数据库分开。候选为随已授权项目库 2→3，在 Coding/Runtime owner 下仅转换受影响的 key 到明确的「历史活动待核对」成员，保留旧 subject/title 与原用途。新格式的一种有效业务状态是来源从前未记录完整，展示并允许按原活动路径重新选择或首次实际读时建立 ref，旧项不造版本、指纹、固定状态或选择范围。队列保全原意图和待执行状态，升级前后的合法队列仍可执行。主台核既定历史消费者迁移是否明确涵盖该 key 变形及非 Files 项处理，确认后登记保留机制。无对应授权时保留旧值并暂停该转换的采用，写手继续其余切片。
- 真正接收的轮次由 Agent Host 自己持久化。建议将 `material_ref` 与实际 `read_revision` 加到 `AgentTextMaterial`/冻结元数据；保留只有真正成果才填的 `source_artifact_id/source_version`。同次解析得到的实际文本仍交 Prologue 现有资源暂存及 SDK 接收，引用元数据与之绑定，保持现有持久接收、放弃未接收 intent 和重试行为。历史轮次重新打开、恢复或重试 SDK 已接收的轮次均沿原资源，活引用改变也不重新读取替换冻结正文。主动新开一轮重新解析活动引用。老轮次显示原题名和已有成果信息，缺完整 ref 显示「当时未记录来源版本」，不能从现文件猜 ref。新轮次摘要复制嵌套引用，报告/任务板只识别原有真实成果字段。独立的 SDK Saved History 回放仍用其原事件及资源，这一改动的持久事实是本地可重开的 Agent 轮次，须证明已有历史同步未丢正文。
- 现有接收链是 Coding `start-round.ts:195,225–265` → Agent `prologue-run-start.ts:72` 把实际文字交运行时 → `prologue-frozen.ts:43` 冻结材料题名/成果版本 → `prologue-run.ts:319–337` 在 SDK 接收前持久化 intent，未接收才撤 intent；`:601` 把实际正文暂存为 exact original resource，`:569` 的 resume 调现有 SDK control。Coding 的 last-start 写在 start 成功之后，无权用另一份存储补接收事实。重开由 `prologue-recovery.ts:112–122`/Agent readRun → Coding `routes-timeline.ts:125–171`/`session-window.ts:25–38` → `browser/main/run-facts.ts:27`。保存历史从 `prologue-saved-history.ts:29` 检查 SessionIndex 原归属后由 SDK replay/export。
- **需主台核授权并裁决的新增升级范围**。Agent Host 是 `format.prologue.session-index` owner；`tooling/versions.json:1022`、`prologue-session-index.ts:10,48–79` 定义 v1 和 storage.get/readSecure/commit CAS，实际载体 `agent-runtime/records/molis-agent-index-*/<id>.json` 的加密正文和元数据 schema，`version` 是单记录 CAS。建议 1→2 连续步只改确切 namespace 内 v1 元数据/正文 schema，保留原 owner/attempts/资源，旧 ref 继续缺省。U1 现行入口 `runHomeUpgrade`→`ensureHomeUpgraded`（`apps/local-host/src/home-upgrade.ts:354,395`），由 `home-upgrade-stores.ts:59–80` 登记普通版本文件、SQLite、插件表；未发现 SessionIndex 的登记或可直接升级加密正文的 descriptor。复用 Home 与 Agent runtime owner 锁、SDK 现行 list/get/readSecure/commit 能力，只在运行时业务打开前按 exact kind 枚举及拒绝更高/外来记录，以 HOME-DATA 的 records/storage.key 同点备份和 CAS 恢复顺序接 U1；正式 GO 需隔离证明可在不创建新 key、不启动执行器的情况下安全使用此存储，且 U1 stamp/失败恢复覆盖该版本。本批已明确的项目库 2→3/Files 数据权限未明确扩到此版本载体，不能以无版本可选字段或另一张映射表绕开。
- 临时 worktree 沿 `workspace-git-worktrees.ts:17,121` 的 Host 拥有者解析和 `workspace-git-writers.ts:56` 的授权列表。按真实项目、原 workspace root、Host 的 worktree 身份及 Git 注册的 checkout 标识给已有 `workspace_file` 形状派生一个有保留前缀的有界 root id。当前浏览解析所选项目/会话的已授权 worktree，执行中的根取该轮 frozen directory/worktree。每次重新匹配 Host 登记、路径封闭和工作区许可；同名输出根、其他项目根、重建后身份已变的路径都拒绝。重开可重新解析身份未变的原 checkout；已删除的活动引用明确 unavailable，过程项捕获保持精确。此 root id 不是新目录映射，不向 `projects.directories` 写入，不把相同目录名当身份证明。

现况定位：`plugins/native/coding/src/{materials.ts:13,routes-sessions.ts:194,wake-loop.ts:149,delegation-dispatch.ts}`、`browser/main/mount-forms.ts:94`；`packages/plugin-runtime/src/private-storage.ts:55`；`horizontal/agent-host/src/run-start.ts:143`；`apps/local-host/src/agent-host-composition.ts:237`；`docs/system/HOME-DATA.md:204,214`。

## 3. 通用 picker 与插件页面

- 复用 workbench 公用 picker，输入是来源与可选择模式，结果 `confirmed(items: {ref,title,hint?}[])` / `cancelled` / `unavailable`，确认空数组与取消不同。Goal、Coding、Assistant 和插件 frame 都用这份请求与响应；更新既有 picker 的 DOM 事件登记，frame 走已有 MessagePort up/down typed 通道、可信用户手势和 scope 管理，返回确认后的引用及题名。Parent 信任当前页的 project/install context，预览由人的现行授权裁定，给 frame 前用真实页面调用者执行同一资料 head 权限检查，核其安装、声明和 scope，frame 只收到它获准的引用。以后任何读取仍经动作授权，picker 本身不发 grant。
- 一个页面 scope 下请求 ID 隔离，取消、换页、卸载、撤权、项目/账号变化终止当前请求，忽略迟到结果，保留原选中项。普通打开、预览和未确认选择只读；显式固定由确认手势发起，采用 BSH-05 的最终检查。若固定已提交后目标消费者写入失败，显示已固定的同一 ref 可重试，用户取消后不再发额外写请求。
- 入口是 `apps/workbench/src/browser/knowledge/{picker,entry}.ts`、`plugin-frame/{types,child,parent,file-picker}.ts`、`packages/contracts/src/platform/{composer,dom-events}.ts` 及 Host 的 `plugin-page-http.ts`/`plugin-page-authority.ts:158`。保留现有独立附件 picker；第二个实际插件与 Coding 共享通用资料请求。

## 4. 续读、选择与文件变更

- 保留现行读全文 API 的含义，给 owner 的工作区文件读和现有 `file_source.content` 增加显式 text-window 形态。首次及后续每段最多现行 256 KiB，返回 UTF-8 完整字符的文字、原文绝对 UTF-16 偏移和到末尾前的 next_cursor。游标为 owner 签发的有界不透明值，绑定可信项目、actor、精确 root/路径、文件观察身份及下一位置。文件打开仍做根封闭、禁 symlink 和 fd 前后检查；每段重查权限及 dev/ino/size/mtime/ctime。文件变化返回 changed，UI 丢弃混合段和旧选区，用户从当前版重读。服务重开失效的游标可刷新首段。逐段读取到 EOF，保留 A 的「继续读取」及绝对范围选择。
- 当前阅读 revision 沿 SSC-28，现行指纹预算内才产生真 SHA，超预算标 size/不可精确比对；游标的文件观察身份独立于这份可比较指纹。固定选区由 owner 重新核同一观察和真实范围，抓取原文 UTF-16 半开区间，可选已加载的范围。固定全文沿已有 1 MiB 序列化约束，超限明确告知「可固定选区」，仍可分段读到末尾。固定和续读都不返回静默截断的全文，二进制继续走原信任与预览规则。
- 文件边界是 `apps/local-host/src/{workspace-files,project-capabilities}.ts`、`horizontal/knowledge/src/workspace.ts`、`packages/contracts/src/{platform/file-sources,modules/workspace-artifacts}.ts`。验证真实多字节字符跨分段、同大小改写、替换 inode、权限撤销、游标跨项目，以及捕获前发生变更。

## 5. 原阅读命令与端口

- A 原型 `docs/design/batch-06-materials/app.js:909–913` 的 `read/place=coding` 是原 Coding 内嵌 Files 阅读面的文件行打开手势。将此手势接平台 `materials.open` 显式命令，成功仍在 A 的侧区就地显示。原 `files.open` 成功读文本后保存阅读位置并在可列目录时发布当前根的 files collection，移交该语义给系统资料 owner。保留 collection 的 workspace/handle/display_name/entry_count/truncated/selection.path 合同和用户已有合法绑定。没有内置 collection 默认消费者的证据；保留手绑/外装消费，实测已知 Diff before/after、Text Stats before。
- Side 行、Goal/picker 预览、续读、程序恢复阅读位置只走只读查询。上次阅读位置与 Recent 分开，沿原 actor/项目/根/相对路径归属，用项目 2→3 的系统 owner 保存并搬运原合法历史。读到位置也先验当前权限。根切换、失权或卸载通过现有范围事件失效旧端口；以当前 open 操作票据丢弃先发后回的旧响应。异步读和列目录完成后才进最终授权与同步事务，合法 open 更新位置，根可列时同时提交集合过程项、端口及事件；读成功但目录不可列维持原只保存位置的行为。固定 before/after/selection 继续独立的用户意图，沿原端口消费授权。拒绝场景保证零位置、过程项、端口和事件写入。
- 现况 `plugins/native/files/src/{actions.ts:69,153,185,position.ts}`，退出时在 PR 清点原固定动作引用及绑定消费者。兼容数据与旧同意按 BSH-06/07/14 正式方案，恢复入口显式授权。

## 6. N52 首屏与来源故障

- 在 `side-files-http.ts:59–77` 现有 `GET /api/side/files/sources` 内做一次 localWebActionContext 与一次 discover，拿可见来源和每个来源第一页/next_cursor/状态。保留本地目录分角色、导入、项目对象和最近最多五份。来源未配置时展示可配置状态，零条目动作调用；未授权来源隐藏。某一源超时/失败以该来源状态返回，其他来源和已有内容可继续使用。工作区树用真实根及分层分页，读取子目录时保持 owner 的路径与权限检查。独立后续分页按源及父路径请求，游标按该 owner 的版本/排序契约。普通详情按需。
- 避免源动作内部重复发现。已知目录/文件动作经登记的 exact ref 和原 caller 调用；来源解释复用同一请求、同一 audience 的发现视图，Recent 为空跳过解释。每次实际调用、最后等待后和最终交付保留实时权限，发现结果只指明入口。若来源 authority 在发现之后撤销，只对该源返回拒绝，零正文交付。
- Side 和 Goal 加输入使用同一 loader，移除 `side-panel-files.ts:200–230` 首屏 states 2000/30 秒缓存与逐来源 entries，`scripts/client/placement.ts:381` 的独立加载也收敛。已展示项需要的精确状态经知识 owner 按 key 取，保留按需 search，不扫全项目。相关 Host 入口 `material-origins.ts:48`、`horizontal/knowledge/src/workspace.ts:85`、`knowledge-http.ts:41`。无新聚合动作或持久状态。

## 写手顺序与验证

1. **共用 owner 与合同**。先实现精确读/capture/open、工作区分段/worktree、项目 2→3 内的阅读位置，落 BSH-05/06/07。与 N12 和 BSH-14 串行改 Host 项目库、启动接线和升级入口；同一写手收口 contracts/SDK、`tooling/versions.json`、API/action 快照及合同记录。
2. **S4 工作台**。共用 loader、N52、frame/picker 和原位阅读器接合同，沿 A 和 D 核样。涉及 side/Goal loader、DOM 事件和 frame protocol 在同片串行对齐。
3. **S5 消费者**。Goal 固定过程项绑定和 Coding 草稿/待运行意图依共用 owner，保留 Diff/Text Stats 与其他实际插件的主路径。Agent 冻结元数据与 secure session-index 升级只在上述载体范围裁定后接入，版本登记不与别片并写。S6 的 Files 全删除仍以全部正式采用门槛为前提。

| 验收沿用 | 写手的针对性证明 |
| --- | --- |
| SSC-28 / WMD-04 / BSH-05、08 | 真实活文件原摘要持久化，变更仍可读；Goal 固定/选区经过程项 owner，重开精确回读；库成果/活动对象仍各走原链，拒异项目/个人/伪造 ref；取消撤权后零写。 |
| WMD-04、09、11 / BSH-07、08 | 草稿、排队、委派、接收轮次重开后保精确引用；同一已接收轮次从原资源恢复，真实文件变更不替换正文；旧轮次、旧草稿明示缺来源版本；同名输出目录、他项目、已移除/替换的 worktree 无 fallback。 |
| WMD-05、06 / BSH-05、06、08 | 第二个真实插件与 Coding 共用 picker，验证未授权、换页/卸载、取消、迟到与空确认。跨 UTF-8 边界读完整大文件，超 1 MiB 的全文固定明确拒，真实选区和保存内容一致。 |
| BSH-07、08 / WMD-10 | 原 Coding 文件行打开后位置和合法 files 端口消费者可见，Side/picker/继续读零写，位置能重启恢复，scope 切换失效；C、D 走既有独立验收。 |
| BSH-13 | `tests/call-budget.test.ts` 加真实多来源 Side/Goal 首屏，计每次一次 HTTP/上下文/发现，零逐源 entries、未配置零条目，包含源失败和发现后撤权。沿产品动线实读分页及内容，检验游标变更。 |

在途文件按主台核对：#1999 与 frame 的 `child.ts`、`files.ts`、合同 `platform/ui.ts` 及 Knowledge 入口共享文件，写手先核其 patch 并保留 readiness/失败重试。#2000 的 Coding settings/MCP 与资料事实独立。两者都占 `tooling/versions.json`，最后按条目合并。

已核代码及原型入口，未运行构建、测试或真实 Home。主台需集中核对的新增决定是 Agent 轮次的加密载体 1→2，以及项目 2→3 对 Coding 私有值转形的明确授权范围。其余按既定 A、WMD 和 Files 历史迁移方案推进。U1 的 Agent secure 枚举/备份续接是该载体决定的技术采用条件。公共 C/D 仍各自审查。
