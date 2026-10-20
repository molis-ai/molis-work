# 最近三天 PR 复审 checklist（227 个已合入 PR）

审计基线：`origin/main` `3ba9185d7`（2026-10-20 16:07 UTC），含 16:25Z 合入的 #828。完整逐条结论见 CSV；本表每个 PR 一行。

列：遗漏 / 逻辑 / 规范 / 防腐 / 评论 / 合并；`pass`=未发现问题，`concern`=有风险或证据不足，`issue`=有具体问题，`n/a`=不适用。


## 2026-10-17

| PR | 结论 | 类型 | 遗漏 | 逻辑 | 规范 | 防腐 | 评论 | 合并 | 处理状态 | 一句话 |
|---|---|---|---|---|---|---|---|---|---|---|
| [#608](https://github.com/molis-ai/molis-work/pull/608) | concern | docs | pass | n/a | concern | pass | partial | ok |  | 只读审查报告入库，但三条合并前意见中只有路径问题后来由 #756 修掉，health-gates/报告引用与 F 编号撞号仍留在 main。 |
| [#629](https://github.com/molis-ai/molis-work/pull/629) | issue | code | pass | issue | pass | pass | n/a | ok | 仍存在（建议修） | 收尾核对整体方向落地，但把 suggest-action/suggest-memory 当作已改动，导致「只提议记忆/按钮却说已记住/已保… |
| [#630](https://github.com/molis-ai/molis-work/pull/630) | pass | code | pass | pass | pass | pass | n/a | ok |  | 旧皮肤层按片删除，活规则迁移到各主人并有计算值/截图证据；死样式与断言处理有记录、后续已清理。 |
| [#633](https://github.com/molis-ai/molis-work/pull/633) | pass | code | pass | pass | pass | n/a | n/a | ok |  | 机器槽票据的半写竞态修得完整，读写两侧都按文件名认持有者，测试覆盖半写票与外部删票。 |
| [#636](https://github.com/molis-ai/molis-work/pull/636) | pass | mixed | pass | pass | pass | pass | n/a | ok |  | 许可、分发材料、安装器透传与打包测试一起切换，未发现遗漏的 MIT 声明或许可断链。 |
| [#637](https://github.com/molis-ai/molis-work/pull/637) | concern | code | pass | concern | pass | pass | yes | ok |  | P4 工作图与子任务 step 的设计落地；merge 前只留一个低概率 watch 竞态，已由 A2 的 SDK 等待路径取代。 |
| [#638](https://github.com/molis-ai/molis-work/pull/638) | concern | code | pass | concern | pass | pass | n/a | ok |  | 对象引用题的主要通路完整，但共享客户端的失焦/清空竞态与宿主不截断主人标题是两个具体边界缺陷。 |
| [#639](https://github.com/molis-ai/molis-work/pull/639) | pass | code | pass | pass | pass | pass | n/a | ok |  | 排队的补充只在无活轮次时读、只画一次，合同和页面预算同步；未发现具体缺陷。 |
| [#640](https://github.com/molis-ai/molis-work/pull/640) | pass | docs | pass | n/a | pass | n/a | n/a | ok |  | 许可合并后的 spec 归档、索引与证据都正确。 |
| [#641](https://github.com/molis-ai/molis-work/pull/641) | pass | code | pass | pass | pass | pass | n/a | ok |  | vendored SDK 的来源、哈希、旧包历史与依赖记录一致，未发现遗漏。 |
| [#642](https://github.com/molis-ai/molis-work/pull/642) | pass | test | pass | n/a | pass | n/a | n/a | ok |  | 测试夹具的时序修复只影响假 Host 的后台唤醒，断言未放宽。 |
| [#643](https://github.com/molis-ai/molis-work/pull/643) | pass | code | pass | pass | pass | pass | n/a | ok |  | 模型只拿结果、人能在卡片上看到被扣原因，合同与断言同步变严；未发现具体缺陷。 |
| [#644](https://github.com/molis-ai/molis-work/pull/644) | concern | code | pass | concern | pass | pass | n/a | ok |  | SDK 换包与工作图接续修复基本对齐，但 binding 没判断已花掉的请求键，键已提交后的拒绝仍可能留下不可接续的 eligible 项… |
| [#645](https://github.com/molis-ai/molis-work/pull/645) | pass | test | pass | n/a | pass | n/a | n/a | ok |  | 把日期炸弹改成从数据自身日期推进的假时钟，断言未放宽。 |
| [#646](https://github.com/molis-ai/molis-work/pull/646) | pass | test | pass | n/a | pass | n/a | n/a | ok |  | 等 pid 文件真正写出正整数再读，避免空文件/pid 0 竞态，断言未放宽。 |
| [#647](https://github.com/molis-ai/molis-work/pull/647) | pass | docs | pass | n/a | pass | pass | yes | ok |  | §10.23 复查记录；事实与合并过程基本相符，无代码改动。 |
| [#648](https://github.com/molis-ai/molis-work/pull/648) | concern | code | pass | concern | pass | pass | n/a | ok |  | 修好 #637 的步骤残留；合并时留有并发复用步骤的窄窗口（BL-154），已由 #665 修掉。 |
| [#649](https://github.com/molis-ai/molis-work/pull/649) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 补上撤回未读补充与 about 纠正回执；合同、动作快照、文档和测试同步完整。 |
| [#650](https://github.com/molis-ai/molis-work/pull/650) | issue | mixed | issue | pass | concern | concern | n/a | issue | 文档已由 #814 修；共享核心未跑全量的流程问题仍在 | 带注解 SDK 工具接入逻辑正确，但漏了 SECURITY-INVARIANTS 的当前包名，且以无 full-suite 标签的方式合入… |
| [#651](https://github.com/molis-ai/molis-work/pull/651) | pass | code | pass | pass | pass | pass | n/a | ok |  | 分屏 Pages 落点与 S-30 统一检查落地；消息来源与一次性令牌的控制流正确，死代码清理有据。 |
| [#652](https://github.com/molis-ai/molis-work/pull/652) | pass | docs | pass | n/a | pass | pass | yes | ok |  | §10.24 复查记录与两条 backlog；内容与 #648/#650 的事实相符。 |
| [#653](https://github.com/molis-ai/molis-work/pull/653) | pass | test | pass | n/a | pass | n/a | yes | ok |  | 测试容忍 refused page 的无 body 中间态，没有放宽真正的拒绝断言。 |
| [#654](https://github.com/molis-ai/molis-work/pull/654) | concern | mixed | concern | pass | pass | pass | yes | ok |  | 交回改用 SDK 等待与接续，控制流按协调规则实现；唯一明确余项是旧键暂时出现在 Work 视图，已由 A4/#680 清理。 |
| [#655](https://github.com/molis-ai/molis-work/pull/655) | pass | docs | pass | pass | pass | pass | yes | ok |  | 交互手册与 §15.8 示例 1 用例；文档、AC 与 product subset 同步，无代码风险。 |
| [#656](https://github.com/molis-ai/molis-work/pull/656) | pass | test | pass | n/a | pass | n/a | yes | ok |  | MCP stdio 用例时限 20→60 秒，断言不变。 |
| [#657](https://github.com/molis-ai/molis-work/pull/657) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 创作台示例去掉随手条数/字数并加产品约束规则；文档与来源字符串同步。 |
| [#658](https://github.com/molis-ai/molis-work/pull/658) | pass | code | pass | pass | pass | pass | yes | ok |  | 交叉检查提示词 v2 去掉非产品限制；评测与 spec 记录完整。 |
| [#659](https://github.com/molis-ai/molis-work/pull/659) | pass | test | pass | n/a | pass | n/a | n/a | ok |  | AC-08 并发作答用例与 AC-07 缺口记录；断言只加不放宽。 |
| [#660](https://github.com/molis-ai/molis-work/pull/660) | pass | code | pass | pass | pass | pass | yes | ok |  | 助理回复里的选区成为手上的东西并可落入左边 Pages；合同、快照、页面预算和用例同步。 |
| [#662](https://github.com/molis-ai/molis-work/pull/662) | concern | code | pass | concern | pass | pass | yes | ok |  | 删掉最后一层 calm-desktop 并把仍生效的规则移到主人；样式等价性依赖 PR 的探针记录，未独立复核。 |
| [#663](https://github.com/molis-ai/molis-work/pull/663) | pass | docs | pass | n/a | pass | pass | yes | ok |  | 设计文档把评审提出的停放标记、写入顺序、其他轮、错误码和用例五点都写进了 §15.9；纯文档，合入正确。 |
| [#664](https://github.com/molis-ai/molis-work/pull/664) | pass | code | pass | pass | pass | pass | yes | ok |  | 卡片放进当前工作的判断收成一条 holds 规则，事件登记与宿主四种拒绝都齐，页面预算下降；合并正确。 |
| [#665](https://github.com/molis-ai/molis-work/pull/665) | pass | code | pass | pass | pass | pass | yes | ok |  | 把 ready 判断和结束合并成图适配器里的一次同步读+版本化写，修掉 #648 余项；合同/快照/用例齐，合并正确。 |
| [#666](https://github.com/molis-ai/molis-work/pull/666) | pass | code | pass | pass | pass | pass | yes | ok |  | 把两个巨型分发函数拆成三张有序表，次序、守卫、404 与边界检查都保持或变严；大 PR 的关键文件已读，合并正确。 |
| [#667](https://github.com/molis-ai/molis-work/pull/667) | issue | code | issue | pass | pass | pass | yes | ok | 已由 #800/#793 修复 | 撤回/更正的控制流与运行时接线基本扎实，字节放行也有界；但升 v6 后漏改 skill 与 Coding README，留下仍在教 v5 … |
| [#668](https://github.com/molis-ai/molis-work/pull/668) | pass | mixed | pass | n/a | pass | pass | yes | ok |  | 换包记录、哈希与 patch-history 一致，旧包删除，两个新选项未启用；合并正确。 |
| [#669](https://github.com/molis-ai/molis-work/pull/669) | pass | code | pass | pass | pass | pass | yes | ok |  | 助理与 Coding 共用一份「重新问」材料，closed/权限/组合拒绝都做在 Host；合同与预算齐，合并正确。 |
| [#670](https://github.com/molis-ai/molis-work/pull/670) | pass | code | pass | pass | pass | pass | yes | ok |  | SDK 运行控制错误在一处映射成 Agent 的话，原码只留诊断；测试与合同记录齐，合并正确。 |
| [#671](https://github.com/molis-ai/molis-work/pull/671) | pass | code | pass | pass | pass | pass | n/a | ok |  | 共享托盘只从账上列未处理项，Coding 的旧排队条被替换而不是并存；Assistant 侧按计划留给 3b-2c，合并正确。 |
| [#672](https://github.com/molis-ai/molis-work/pull/672) | pass | mixed | pass | n/a | pass | pass | yes | ok |  | 只删一句向模型恳求格式的话并升版本，记录与测试同步；没有工程补丁，合并正确。 |
| [#673](https://github.com/molis-ai/molis-work/pull/673) | concern | code | pass | concern | pass | pass | n/a | ok |  | 结果卡拾取、闪线与死代码删除整体成立、预算只降；但选区边界只认 anchor，跨边界拖选可能被误当拾取，需确认。 |
| [#674](https://github.com/molis-ai/molis-work/pull/674) | concern | mixed | pass | n/a | concern | pass | n/a | ok |  | 提示词只删一句格式禁令，记录与数据充分；唯一问题是按仓库规则应跑的 studio:replay smoke 没有跑，作者已如实说明。 |
| [#675](https://github.com/molis-ai/molis-work/pull/675) | issue | code | pass | issue | pass | pass | yes | concern | 已由 #754 修复 | 后台作业迁移到工作图与 Host wait 的方向和大部分控制流成立，但 #follower 把暂时读失败当工作不存在，让作业永久 unc… |
| [#676](https://github.com/molis-ai/molis-work/pull/676) | pass | ci | pass | pass | pass | pass | n/a | ok |  | 库版本一变就必须在维护清单里有一行，门禁失败即关、只读指定表，有测试与已知缺口记录；合并正确。 |
| [#677](https://github.com/molis-ai/molis-work/pull/677) | pass | code | pass | n/a | pass | pass | n/a | ok |  | 删掉的 26 个设置页 desktop-shell 选择器确无匹配页面，测试与预算同步，页面资源下降；合并正确。 |
| [#678](https://github.com/molis-ai/molis-work/pull/678) | pass | docs | pass | n/a | pass | pass | n/a | ok |  | §10.25 的复查记录与抽查到的代码、字节和删文件事实一致，没有发现需要补的修改。 |
| [#679](https://github.com/molis-ai/molis-work/pull/679) | pass | code | pass | pass | pass | pass | yes | ok |  | 路径即项目、宿主签发控制、写前重查和请求结束失效都落在实际控制流里，测试与 S-31/API 快照齐全，最终全量绿后 squash 合入。 |
| [#680](https://github.com/molis-ai/molis-work/pull/680) | pass | code | pass | pass | pass | pass | n/a | ok |  | Work 视图按合同逐项取、委派上限收成一张表，测试和 baseline 同步；叠在 #675 上但合并时父 PR 已在 main，未夹带… |
| [#681](https://github.com/molis-ai/molis-work/pull/681) | issue | code | pass | issue | pass | pass | n/a | ok | 仍存在 | 按项目算对象引用种类的主路径和上限/拒绝都对，但 builtinOf 把 Runtime 内置插件（Todo）误当成外部插件，S-32 的… |
| [#682](https://github.com/molis-ai/molis-work/pull/682) | pass | code | pass | pass | pass | pass | n/a | ok |  | 报告的“补充要求”逐条区分账上事实、AI 的话和人的原话，注入测试通过真实 HTML 与后续材料路径验证；没有发现缺陷。 |
| [#683](https://github.com/molis-ai/molis-work/pull/683) | pass | code | pass | pass | pass | pass | n/a | ok |  | 调用方走掉时停止后续模型调用，flush 与 judgeOwn 的回填规则和身份边界清楚，测试覆盖两条路径。 |
| [#685](https://github.com/molis-ai/molis-work/pull/685) | pass | code | pass | pass | pass | pass | n/a | ok |  | 角色工具由 SDK 按声明给出的事实写回提示词，v6 版本与 A1 用例一致；没有发现缺陷。 |
| [#686](https://github.com/molis-ai/molis-work/pull/686) | concern | docs | concern | n/a | pass | pass | yes | ok |  | §10.26 的多数字节与提交结论准确，但复查把 #667 判为有依据，没有指出 Coding README 与 prologue-ai … |
| [#687](https://github.com/molis-ai/molis-work/pull/687) | pass | code | pass | pass | pass | pass | n/a | ok |  | 助理托盘的未读/空队列语义、每面一个托盘、共用措辞表和页面字节许可都落实，测试与快照齐全。 |
| [#689](https://github.com/molis-ai/molis-work/pull/689) | pass | test | pass | n/a | pass | n/a | n/a | ok |  | retry 用例更确定也更严格，没有放宽或掩盖产品缺陷。 |
| [#690](https://github.com/molis-ai/molis-work/pull/690) | concern | mixed | pass | concern | pass | pass | n/a | ok |  | Prologue 包、锁、provenance 与历史记录都对；REFUSED_BEFORE_RUN 的三个新码没有测试覆盖，判 conc… |
| [#691](https://github.com/molis-ai/molis-work/pull/691) | pass | code | pass | pass | pass | pass | n/a | ok |  | 窗格落点闪与「更多」菜单闪都走统一的窗格消息和 pointed/pinned 区分，S-30、事件快照和页面资源同步，没有发现缺陷。 |
| [#692](https://github.com/molis-ai/molis-work/pull/692) | concern | docs | concern | n/a | pass | pass | n/a | ok |  | A2 写后诊断的合同、预算、拒绝路径和验收编号完整，但把 SDK 的默认 60k 写成了本仓库 Runtime 的实际上限（配置是 300… |
| [#693](https://github.com/molis-ai/molis-work/pull/693) | pass | code | pass | pass | pass | pass | n/a | ok |  | 协调者 v7 只删偏向一条路的等待教学，子角色说明与 runTools 的事实对齐，评测记录完整；没有发现缺陷。 |

## 2026-10-18

| PR | 结论 | 类型 | 遗漏 | 逻辑 | 规范 | 防腐 | 评论 | 合并 | 处理状态 | 一句话 |
|---|---|---|---|---|---|---|---|---|---|---|
| [#634](https://github.com/molis-ai/molis-work/pull/634) | issue | code | pass | issue | pass | pass | partial | ok | 已由 #740 修复 | 五项审查要求都落实了，但合并代码在『移回开始后服务关闭』这条 S-35 不变式上不成立，合并后复审报出并由 #740 修复。 |
| [#661](https://github.com/molis-ai/molis-work/pull/661) | concern | code | pass | concern | pass | pass | yes | ok |  | 统筹的每一条合并前要求都落实并被复核，安装/下载/授权路径读到的实现与 S-36/S-37 一致；体量太大只能抽样，未读的状态机与交错留在… |
| [#684](https://github.com/molis-ai/molis-work/pull/684) | pass | code | pass | pass | pass | pass | yes | ok |  | Todo 完整迁到 Home Plugin Runtime：旧宿主路径与冻结名单只减，库登记/路由/限体/资源都有配套，审查要求全部落实。 |
| [#688](https://github.com/molis-ai/molis-work/pull/688) | pass | code | pass | pass | pass | pass | n/a | ok |  | 回执两端（报告↔补充）按 surface 打通，共享构造没有被复制，资源增长等于事前批准的额度；未发现缺陷。 |
| [#695](https://github.com/molis-ai/molis-work/pull/695) | pass | code | pass | pass | pass | pass | n/a | ok |  | 停放问题的回答按当前授权写入、下一轮按回答者的身份开，失败时答案留队并说明原因；合同、S-33、用例与翻译配套完整。 |
| [#696](https://github.com/molis-ai/molis-work/pull/696) | pass | mixed | pass | pass | pass | pass | n/a | ok |  | AC-05 的三条不串线用例加上 Coding 引用题回答的处理器修复，形状校验与限额都取共享 SDK；没有放宽断言。 |
| [#697](https://github.com/molis-ai/molis-work/pull/697) | pass | code | pass | pass | pass | pass | n/a | ok |  | coding-base 去掉了问卷填写细则、版本升到 11，评测按事先写下的判定规则记录并如实包括不利结果；没有发现缺陷。 |
| [#698](https://github.com/molis-ai/molis-work/pull/698) | pass | code | pass | pass | pass | pass | n/a | ok |  | 宿主自己停的一轮现在留下原因，live 与重开后都读得到；用例覆盖没有第三次调用与重启恢复。 |
| [#699](https://github.com/molis-ai/molis-work/pull/699) | pass | mixed | pass | pass | pass | pass | n/a | ok |  | SDK 换包与来源记录、S-38、测试、锁文件、workspace 登记全部一致，包哈希与计数我按冻结树复核过；没有发现缺陷。 |
| [#700](https://github.com/molis-ai/molis-work/pull/700) | issue | code | pass | issue | concern | pass | n/a | ok | 已由 #711 修复 | origin 的校验逻辑本身齐全，但合并版本在 beforeEffect 之前就核来源，撤回竞态会让 withdrawn 输入成为新步骤的… |
| [#701](https://github.com/molis-ai/molis-work/pull/701) | concern | code | pass | concern | pass | pass | n/a | ok |  | 右栏与常开插件做成通用声明，Shelf 不再是宿主里的特例；但 always_on 的生效条件与 S-34 在非 personal 声明者… |
| [#702](https://github.com/molis-ai/molis-work/pull/702) | concern | code | concern | pass | pass | pass | n/a | ok |  | 写进问卷的正文/草稿分流做得完整且有真实 Chrome 用例；唯一问题是 spec 把芯片文字写成带题目，与实现不符。 |
| [#703](https://github.com/molis-ai/molis-work/pull/703) | concern | code | pass | concern | concern | pass | partial | concern |  | 流式路由的边界与取消实现读到的都对，但合并前没走统筹/全量、合同文件里留下一处错位注释，main 上的补跑还出现一次超时。 |
| [#704](https://github.com/molis-ai/molis-work/pull/704) | pass | code | pass | pass | pass | pass | n/a | ok |  | 把 Shelf 的屏幕矩形变成唯一可信的落点依据、Rust 侧先校验，热键改为通用 openPlugin；用例覆盖显示/切换/关闭与框架不… |
| [#705](https://github.com/molis-ai/molis-work/pull/705) | pass | docs | pass | n/a | pass | n/a | n/a | ok |  | 把页面资源从硬上限改写为体积控制并同步了所有引用处，与门禁的一次性放行实现一致。 |
| [#706](https://github.com/molis-ai/molis-work/pull/706) | concern | code | concern | pass | concern | pass | n/a | ok |  | 功能、合同与门禁都齐，读板逻辑正确；两处小问题：块注释随页面程序下发（后由 #778 修）、spec 的 coding.js 字节数写错 … |
| [#707](https://github.com/molis-ai/molis-work/pull/707) | concern | ci | pass | concern | pass | n/a | n/a | ok |  | cargo test 进 CI 且各类失败路径有用例；唯一风险是新加的锁只串行化了 drop-wheel 模块的粘贴板用例，shelf 模… |
| [#708](https://github.com/molis-ai/molis-work/pull/708) | concern | code | concern | pass | pass | pass | yes | concern |  | 错误码与页面拒答逻辑正确、测试更严；两处审计痕迹：spec AC-11 写入过时包提交，及最终 head 的全量重跑被取消后即合入。 |
| [#709](https://github.com/molis-ai/molis-work/pull/709) | concern | code | pass | concern | pass | pass | yes | ok |  | AC-05 的两个窗口与失败路径都钉住了；唯一缺口是空态下两个「新会话」按钮之间没有 creating 互斥，可能并发建会话。 |
| [#710](https://github.com/molis-ai/molis-work/pull/710) | pass | ci | pass | pass | pass | n/a | yes | ok |  | 只改缓存键、说明与实测都补上，没有风险改动。 |
| [#711](https://github.com/molis-ai/molis-work/pull/711) | pass | code | pass | pass | pass | pass | n/a | ok |  | 来源核对在两处落地、边界照实写进 spec、用例覆盖两条路径；没有发现缺陷。 |
| [#712](https://github.com/molis-ai/molis-work/pull/712) | concern | code | concern | pass | pass | pass | yes | ok |  | 安全代码本身正确、单份认框检查与预算都对；缺口是「格里自报的 place 被覆盖」这一条在当次没有被用例证明（后由 #778 补）。 |
| [#713](https://github.com/molis-ai/molis-work/pull/713) | issue | mixed | issue | pass | pass | pass | yes | ok | 已由 #795 修复 | 常量与快照、校验与测试都对；漏的是三个业务角色的版本没有随 host_tools 变化而升，事后由 #795 补。 |
| [#714](https://github.com/molis-ai/molis-work/pull/714) | concern | code | pass | pass | concern | pass | yes | ok |  | 「当前约定」的筛选、标记与打开逻辑正确，放行键与用例齐；两处文案问题（1 rounds 的碎片英文、把 Goal 的「当前约定」借给 AI… |
| [#715](https://github.com/molis-ai/molis-work/pull/715) | pass | ci | pass | pass | pass | n/a | yes | ok |  | 只装 uv 的前提步骤，SHA/版本核对过，没有改任何检查。 |
| [#716](https://github.com/molis-ai/molis-work/pull/716) | concern | ci | concern | pass | pass | n/a | n/a | ok |  | fail-fast + bail 的主路径与重跑逻辑正确、测试证明不再开新文件；缺的是「正在跑的文件被停掉」这半的用例。 |
| [#717](https://github.com/molis-ai/molis-work/pull/717) | issue | docs | issue | n/a | concern | n/a | partial | issue | 历史暴露无法撤回（树已由 #719 清理） | 文档目录与内容大体成立，但在公开仓库里先放了 41k 行原始快照和本机绝对路径（后由 #719 从树中清除、历史仍在），且作者绕过了统筹评… |
| [#718](https://github.com/molis-ai/molis-work/pull/718) | issue | docs | concern | n/a | concern | issue | partial | ok | 防腐设计已改（2026-10-19）；文档事实仍错 | docs-only 交付齐全，但 skill-packs 设计引入了第二条安装/注册路径（事后改掉），另外装配笔记的角色/tool 清单写… |
| [#719](https://github.com/molis-ai/molis-work/pull/719) | pass | docs | pass | n/a | pass | n/a | yes | ok |  | 把原始采集与绝对路径移出公开树、补规范与忽略规则，交接与合并都按统筹流程；没有发现遗留问题。 |
| [#720](https://github.com/molis-ai/molis-work/pull/720) | concern | code | pass | pass | pass | pass | yes | concern |  | W3-C2 的 hover 闪落点与 Esc 作废在途判断都正确、安全边界与用例齐；问题是最终 head 没有跑成承诺的全量就合入。 |
| [#721](https://github.com/molis-ai/molis-work/pull/721) | issue | code | pass | issue | pass | pass | partial | issue | 已由 #735 修复（合并时未按评审要求） | Computer Use 能力补强的大包，控制流与配套文档基本齐；但合入时把一个模型输入直接编译成正则的 ReDoS 带进了 main，评… |
| [#722](https://github.com/molis-ai/molis-work/pull/722) | pass | docs | pass | n/a | pass | pass | yes | ok |  | 产品运营文档的大改：计数、链接、公开边界与术语总体站得住，后续评审的 P3 由后续 docs baseline 修掉；我只做了轻量抽查，没… |
| [#723](https://github.com/molis-ai/molis-work/pull/723) | pass | code | pass | pass | pass | pass | yes | ok |  | 一次干净、可复核的 vendored SDK 换包：哈希/来源/字节/旧包记录都对得上，Molis 侧没有需要跟改的代码，后续 P3 文档… |
| [#724](https://github.com/molis-ai/molis-work/pull/724) | pass | test | pass | n/a | pass | n/a | n/a | ok |  | 只给慢机下的连接器业务用例加时限，断言未动，属于合理的抗 flake 调整。 |
| [#725](https://github.com/molis-ai/molis-work/pull/725) | concern | mixed | pass | pass | concern | pass | partial | ok |  | 提示词去重方向正确，评测也按事先规则做了；遗留的是测试只断言「base 不再说」而没有断言「SDK 工具描述确实说」，属于可复现的知识丢失… |
| [#726](https://github.com/molis-ai/molis-work/pull/726) | pass | code | pass | pass | pass | pass | yes | ok |  | 把 acknowledge-inputs 接到 Coding 的角色与并行写入父角色，常量收口、拒绝路径和回执都有真实宿主用例；后一轮的错… |
| [#727](https://github.com/molis-ai/molis-work/pull/727) | concern | code | pass | pass | concern | concern | partial | ok |  | 材料服务本身按授权、受众、并发与生命周期把关，测试也覆盖了拒绝；遗留的是 S-13 在灵光侧仍把不可信声明放在可改指令里（已记 BL-18… |
| [#728](https://github.com/molis-ai/molis-work/pull/728) | concern | code | pass | concern | concern | pass | yes | ok |  | 写后检查器的动作/存储/授权骨架正确，评审要求的那处注释移动也做了；合入时保存校验缺口会让带路径的检查器永远不跑，#757 已修，普通 E… |
| [#729](https://github.com/molis-ai/molis-work/pull/729) | issue | code | concern | concern | concern | issue | partial | concern | 仍存在 | 灵光的宿主/动作/流迁移本身完成，旧路径也删干净；但工作台仍用构建期手写渲染灵光工作面（P2 未修），另有进度重复与 36 MB 路由上限… |
| [#730](https://github.com/molis-ai/molis-work/pull/730) | concern | code | pass | concern | concern | pass | partial | ok |  | 创建入口与可撤销的直接建按 S-40 设计落地，撤销绑定/一次性/TTL 都对；遗留是令牌 Map 跨项目、借用 assistant 内部… |
| [#731](https://github.com/molis-ai/molis-work/pull/731) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 删半句的改动很小，评测与手册记录完整；Coding 小跑和成本缺口由后续 #777/补记修掉。 |
| [#732](https://github.com/molis-ai/molis-work/pull/732) | pass | docs | pass | n/a | pass | pass | yes | ok |  | 对抗式修订后的产品文档，抽查的事实与链接站得住；后一轮 P3 的术语问题由后续 docs baseline 修掉。 |
| [#733](https://github.com/molis-ai/molis-work/pull/733) | issue | code | concern | pass | concern | issue | partial | issue | 仍存在 | Cognia 迁到 Home Runtime 的主干（动作/路由/库/模型/启动期入口）完成且有 RAC-37/42 用例；但插件自己用 … |
| [#735](https://github.com/molis-ai/molis-work/pull/735) | pass | code | pass | pass | pass | pass | yes | ok |  | 把模型给的桌面选择器从 RegExp 彻底改成子串匹配，合同/说明/安全表/拒绝测试同步，正好补上 #721 的安全缺口。 |
| [#736](https://github.com/molis-ai/molis-work/pull/736) | pass | test | pass | n/a | pass | pass | yes | ok |  | 把灵光路由断言从旧短路径收紧到 Manifest 路径，修掉 #729 合入后共享全量的红；只有注释指错测试这个 P3。 |
| [#737](https://github.com/molis-ai/molis-work/pull/737) | concern | docs | concern | n/a | pass | pass | n/a | ok |  | 文档把 10-18 收口决定写进了 AGENTS/POLICY/GLOSSARY/CALL-CHAINS/RUNTIME-MIGRATIO… |
| [#738](https://github.com/molis-ai/molis-work/pull/738) | concern | code | pass | concern | pass | concern | n/a | ok |  | 私有文件服务的路径/链接/上限/生命周期做得细，但最终调用者复核依赖插件交来的 control，S-18 的表述比实现强；后续 #797 … |
| [#739](https://github.com/molis-ai/molis-work/pull/739) | pass | docs | pass | n/a | pass | pass | n/a | ok |  | 把 Codex 的 §10.27 复查如实落进 spec；虽然 #634 的 P1 在几十分钟后被 #740 修掉，但记录是带日期的历史快… |
| [#740](https://github.com/molis-ai/molis-work/pull/740) | pass | code | pass | pass | pass | pass | n/a | ok |  | 补齐了 #739 记录的那条 P1：关闭在移回等待期间发生时，最终同步检查拒绝，对象不回去；三种交错都有真实用例。 |
| [#742](https://github.com/molis-ai/molis-work/pull/742) | pass | code | pass | pass | pass | pass | n/a | ok |  | 已受理后台执行的授权、取消、结束与旧控制过期这条链完整，测试覆盖真实 HTTP/MCP/Home/项目路径；未发现具体缺陷。 |
| [#743](https://github.com/molis-ai/molis-work/pull/743) | concern | code | pass | concern | pass | pass | n/a | ok |  | 大迁移的合同/装配/安全表/资源都跟着改了；我实际读了 contracts、Runtime 生图与模型设置、Host 接线、Images … |
| [#744](https://github.com/molis-ai/molis-work/pull/744) | pass | code | pass | pass | pass | pass | n/a | ok |  | query 委托和模型回执/原图这两块的核心控制流都读到了，授权链没有发现缺口；未逐个重跑测试。 |
| [#745](https://github.com/molis-ai/molis-work/pull/745) | pass | code | pass | pass | pass | pass | n/a | ok |  | 主人文件树的声明、路径、生命周期与授权都做了平台侧检查，测试覆盖注册/生命周期/真实磁盘拒绝；未发现具体缺陷。 |
| [#746](https://github.com/molis-ai/molis-work/pull/746) | pass | code | pass | pass | pass | pass | n/a | ok |  | 把直接 owner 操作抽成同一工厂并补了恢复查询，身份/owner 检查保持；未发现具体缺陷。 |
| [#747](https://github.com/molis-ai/molis-work/pull/747) | concern | code | pass | concern | pass | pass | n/a | ok |  | Alchemist 的排空/显式恢复和 Search 的派出前授权这条链读到的部分一致；84 文件/3,320 行只深读了 Host、li… |
| [#748](https://github.com/molis-ai/molis-work/pull/748) | concern | code | concern | pass | pass | pass | n/a | ok |  | PPT 的 Runtime 迁移本身装配、路由、成果与库都接好了；唯一的实问题是迁移文档仍说「尚未推送/合入」。 |
| [#749](https://github.com/molis-ai/molis-work/pull/749) | concern | code | concern | pass | pass | pass | n/a | ok |  | Dataset 的 Runtime 迁移本身完整；问题是紧接 #748 之后改的状态句仍把已合入的 PPT 写成待合入。 |
| [#750](https://github.com/molis-ai/molis-work/pull/750) | pass | code | pass | pass | pass | pass | n/a | ok |  | 纯 Store 前置，声明与 schema 唯一化、写前 beforeEffect 与并发凭证保持；未发现具体缺陷。 |
| [#751](https://github.com/molis-ai/molis-work/pull/751) | pass | code | pass | pass | pass | pass | n/a | ok |  | 稳定键迁移与门禁收紧一致，页面/英文/中文与真实浏览器断言都覆盖；未发现具体缺陷。 |
| [#752](https://github.com/molis-ai/molis-work/pull/752) | pass | code | pass | pass | pass | pass | n/a | ok |  | 把 Module 的 repository 收回包内，并用门禁钉住；未发现具体缺陷。 |

## 2026-10-19

| PR | 结论 | 类型 | 遗漏 | 逻辑 | 规范 | 防腐 | 评论 | 合并 | 处理状态 | 一句话 |
|---|---|---|---|---|---|---|---|---|---|---|
| [#741](https://github.com/molis-ai/molis-work/pull/741) | pass | code | pass | pass | pass | pass | n/a | ok |  | 内置插件的可选权限改为按人留下的给，全新安装仍默认打开；配置、文档、测试、baseline 齐全，逻辑抽查未发现漏洞。 |
| [#753](https://github.com/molis-ai/molis-work/pull/753) | concern | code | concern | concern | pass | pass | n/a | ok |  | Pages 编辑器的大拆分在入口、预览、键盘、工具和导出边界上核对一致，测试与资源预算配套完整；未逐行核完 19 个新模块，另有一处已合入… |
| [#754](https://github.com/molis-ai/molis-work/pull/754) | pass | code | pass | pass | pass | pass | n/a | ok |  | 把暂时读不到的工作从“工作不存在”里分出来，测试用真实锁证明锁释放后原步骤继续；改动小且配套完整。 |
| [#755](https://github.com/molis-ai/molis-work/pull/755) | pass | code | pass | pass | pass | pass | n/a | ok |  | 插件路由的拒绝只带 Host 记录的 call_id，JSON 与流两个出口都覆盖，并有拒绝用例钉住；实现与文档一致。 |
| [#756](https://github.com/molis-ai/molis-work/pull/756) | pass | docs | pass | n/a | pass | pass | n/a | ok |  | 一批事实核对过、以 2026-10-18 标记和去开发者路径为主的文档收口；抽查的事实、链接名和代码位置都对得上。 |
| [#757](https://github.com/molis-ai/molis-work/pull/757) | issue | code | pass | issue | pass | pass | yes | issue | 已由 #770 修复（合并时未按评审要求） | 写后检查器的保存校验大体补齐，但合入时 cwd 仍在 normalize 之前检查，能存进跑不了的写法；该缺陷由 #770 在合入后补掉，… |
| [#758](https://github.com/molis-ai/molis-work/pull/758) | pass | docs | pass | n/a | pass | pass | n/a | ok |  | 补齐了 §10.28 的逐 PR 复查、§10.29 的事后复查和一份 109 行的特权/缺口清单；抽查的代码位置和后续状态更新都对得上。 |
| [#759](https://github.com/molis-ai/molis-work/pull/759) | concern | code | pass | concern | pass | pass | partial | ok |  | 首读前的输入框、九个选择入口、对话框和交回意见都收在 draft.owns 上，评审要求的两轮修复都进了 head；剩下的 prefill… |
| [#760](https://github.com/molis-ai/molis-work/pull/760) | pass | code | pass | pass | pass | pass | yes | ok |  | 关项目时结束观察型等待，close 不再等满长轮询；评审第一轮的错误建议被代码事实推翻，最终测试与实现一致。 |
| [#761](https://github.com/molis-ai/molis-work/pull/761) | pass | code | pass | pass | pass | pass | yes | ok |  | Dataset 发布在三个副作用前重查原调用者，测试覆盖四个交错点；评审的 e2e 条件和三条建议后来都由 #776 的平台化修法与五段测… |
| [#762](https://github.com/molis-ai/molis-work/pull/762) | concern | code | concern | pass | pass | pass | partial | concern |  | 四个继续动作统一核对用户/项目/会话，项目 MCP 只让项目调用者管自己的，remove 拆成不可撤回动作；五条小改和 privilege… |
| [#763](https://github.com/molis-ai/molis-work/pull/763) | pass | test | pass | pass | pass | n/a | yes | ok |  | 只加超时现场：请求/回应/候选计数/页面状态一起打出，原错误原样抛出，断言和时限都没动，正是评审要的诊断。 |
| [#764](https://github.com/molis-ai/molis-work/pull/764) | concern | docs | concern | n/a | pass | n/a | partial | concern |  | 口号与开场重写完成，两轮评审的必改项先在本 PR、后由 #771 修掉；还剩一处“预览/开发中”的对外标签不一致。 |
| [#765](https://github.com/molis-ai/molis-work/pull/765) | issue | mixed | concern | issue | concern | concern | partial | concern | 两处逻辑仍存在；baseline 已由 #774 修 | 标签组主流程、PTG-02 去重、拖动占位与分栏 ⌘ 点击都实现且有测试；两处与 spec 冲突：分栏里关组不能撤销，固定/手动组的插件标… |
| [#766](https://github.com/molis-ai/molis-work/pull/766) | issue | docs | issue | n/a | concern | n/a | no | concern | 仍存在 | 45 项验收、20 组机制和来源记录大体成立，但最后一轮复审明确要求的两条——附件状态不归 UIV、插件标签组改为相对链接——原样留在 m… |
| [#767](https://github.com/molis-ai/molis-work/pull/767) | pass | docs | pass | n/a | pass | n/a | n/a | ok |  | 把归档交接、评审记录和 detector 结果里的开发者家目录路径机械替换为 ~/ 或仓库相对路径，符合仓库文档规则，未见事实变化。 |
| [#768](https://github.com/molis-ai/molis-work/pull/768) | pass | mixed | pass | pass | pass | pass | yes | ok |  | Form 发布链的取消/撤权/换提供方窗口按 Dataset/PPT 的写法补齐，五个交错点都有测试，S-18 与 CI 名单同步；未见缺… |
| [#769](https://github.com/molis-ai/molis-work/pull/769) | pass | docs | pass | n/a | pass | n/a | n/a | ok |  | 把 #749 的 P1 从“需复现”改成已由 #761 修好，并记录 #760 修好的主线红；引用提交核对一致。 |
| [#770](https://github.com/molis-ai/molis-work/pull/770) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 按 #757 复审把 cwd 的空白/盘符检查移到 normalize 之后并对齐 SDK 的盘符规则，测试补了提示语和边界；未见缺陷。 |
| [#772](https://github.com/molis-ai/molis-work/pull/772) | concern | mixed | concern | concern | concern | pass | partial | ok |  | place 由元素覆盖自报值的修法正确，S-30 与页面资源也补了；但两条 #730 P2 的新 e2e 从未在 CI 跑过，且“先让总线… |
| [#773](https://github.com/molis-ai/molis-work/pull/773) | pass | test | pass | pass | pass | pass | yes | ok |  | 把菜单路径指向 Molis 窗口的拒绝从 CU-G09 挪进独立的 S-25 CI 用例，并补了正面对照和“没有注入/记成 refused… |
| [#774](https://github.com/molis-ai/molis-work/pull/774) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 补齐 S-37 setup.execute 正向对照、CLI 拒绝不落连接、BL-180 类型与 W6-04 去向，并把 #765 遗留的… |
| [#775](https://github.com/molis-ai/molis-work/pull/775) | concern | mixed | concern | concern | pass | pass | partial | ok |  | 选填单选清除的主流程、焦点与翻译都对，页面资源也下降；但带“其他”输入的清除只清选项不清文字，答案仍非空，且规格板样例与若干验证建议未补。 |
| [#777](https://github.com/molis-ai/molis-work/pull/777) | concern | docs | concern | n/a | concern | n/a | partial | ok |  | Coding 小跑结果、holdFinish 裁定和 BL-176 链接都写清了，算术自洽；但原始数据仍在会被清理的共享笔记里，仓库内无法… |
| [#778](https://github.com/molis-ai/molis-work/pull/778) | pass | code | pass | pass | pass | pass | yes | ok |  | 收据的本人标记、整句英文、改名与错误码四件事都落地，测试与放行齐全；剩下的都是评审明说不挡合并的建议。 读了全部 16 文件 diff、d… |
| [#779](https://github.com/molis-ai/molis-work/pull/779) | pass | code | pass | pass | pass | pass | yes | ok |  | 删除无调用方的 PPT 宿主端口并清掉错误表/基线，行为和装配路径不变。 读了全部 8 文件 diff，并 grep 了删除后引用；未跑测… |
| [#780](https://github.com/molis-ai/molis-work/pull/780) | pass | code | pass | pass | pass | pass | yes | ok |  | 下一步行的结果位按槽位接口接通，顺序、去重、控件都按记录自己的控件；测试补了评审要求的两处。 读了全部 10 文件 diff 与 main… |
| [#781](https://github.com/molis-ai/molis-work/pull/781) | pass | code | pass | pass | pass | pass | yes | ok |  | 继续条件统一按声明的错误码拒绝，探索在 generating 处给出未知调用并进确认串，调用方与快照都改齐。 读了全部 19 文件 dif… |
| [#782](https://github.com/molis-ai/molis-work/pull/782) | pass | docs | pass | n/a | pass | pass | yes | ok |  | 把角色版本的规则和两处现状写进手册与 Skill，Todo 角色 id 已按评审改成 organizer。 |
| [#783](https://github.com/molis-ai/molis-work/pull/783) | concern | ci | concern | pass | pass | n/a | partial | ok |  | docs/ 的两条新规则接线、阈值比较和测试都对，门禁只收不放；两个已知漏网写法既没修也没写进已知限制。 |
| [#785](https://github.com/molis-ai/molis-work/pull/785) | pass | docs | pass | n/a | pass | pass | yes | ok |  | 入口盘点定稿、AC-01/09 回填、生成插件边界写进 Skill；Sessions 漏项已补，冒烟按用户决定记为待补。 |
| [#786](https://github.com/molis-ai/molis-work/pull/786) | pass | docs | pass | n/a | pass | pass | yes | ok |  | 把 Host-only 声明与默认绑定标成 2026-10-18 待改，注释与 PG 行一一对应，没有行为变化。 |
| [#787](https://github.com/molis-ai/molis-work/pull/787) | pass | docs | pass | n/a | pass | pass | yes | ok |  | Skill 四节正文按当前代码写成，Molis 没有的能力都标「没有」，ADH-19～22 的验收现状写清。 |
| [#788](https://github.com/molis-ai/molis-work/pull/788) | pass | code | pass | pass | pass | pass | yes | ok |  | Runtime 插件（含内置）在动作层与路由层都只按安装授权到达用户，S-15 的拒绝测试补齐，阶段 4 残留已登记。 读了全部 12 文… |
| [#789](https://github.com/molis-ai/molis-work/pull/789) | concern | code | concern | concern | pass | pass | partial | ok |  | 交付说明与结果槽接通、测试与放行齐全；评审指出的 view 空值保护未加，spec 英文键数少算一，故记 concern。 读了全部 16… |
| [#790](https://github.com/molis-ai/molis-work/pull/790) | pass | docs | pass | n/a | pass | pass | yes | ok |  | 页面录入改由 Issue 自己起标题的 spec 起草完整，先量、合同变化和可信身份都写明，未实现且状态句如实。 |
| [#791](https://github.com/molis-ai/molis-work/pull/791) | pass | docs | pass | n/a | pass | n/a | yes | ok | stacked，内容随 #789 进 main | §21.9 结果位的顺序与不加 open 端口写清楚了，评审要求的旧说法随 #789 修掉并已进 main。 |
| [#792](https://github.com/molis-ai/molis-work/pull/792) | pass | test | pass | pass | pass | pass | yes | ok |  | S-39 全平台拒绝与 S-13 材料围栏的测试补齐，评审指出的表/标题过度声明已收窄，文档与 BL-183 同步。 |
| [#793](https://github.com/molis-ai/molis-work/pull/793) | pass | code | pass | pass | pass | pass | yes | ok |  | coding.runs.control v7 让补充带上来源，调用方、快照与拒绝用例同步；身份仍只从上下文来。 |
| [#794](https://github.com/molis-ai/molis-work/pull/794) | pass | docs | pass | n/a | pass | n/a | n/a | ok |  | 把 #790 后续的状态句改成实际的方向与代码评审归属，事实与 CODEOWNERS 一致。 |
| [#795](https://github.com/molis-ai/molis-work/pull/795) | pass | code | pass | pass | pass | pass | yes | ok |  | 三个业务角色随 BUSINESS_HOST_TOOLS 的新工具升版本，范围与 spec 记录一致。 |
| [#796](https://github.com/molis-ai/molis-work/pull/796) | pass | test | pass | pass | pass | n/a | n/a | ok |  | 把 Goals 窄屏 e2e 的插件标签与容器标签拆开，补上打开 Goals 即插件标签的断言，属收紧而非放宽。 |
| [#798](https://github.com/molis-ai/molis-work/pull/798) | pass | code | pass | pass | pass | pass | yes | ok |  | 完成后卡的结果进入助理与 Coding 的同一条下一步行，失败轮只给 retry，评审要求与建议都已落地。 |
| [#799](https://github.com/molis-ai/molis-work/pull/799) | pass | docs | pass | n/a | pass | pass | yes | ok |  | T0 的 22 行逐行核完，复查要求的三处修改全部落实，PG-111 的范围与归属写清楚。 |
| [#800](https://github.com/molis-ai/molis-work/pull/800) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 用动作标题和说明把 Alchemist 的研究偏好与通用记忆分开，Skill 去掉过时版本，BL-146 按规则删行。 |
| [#802](https://github.com/molis-ai/molis-work/pull/802) | concern | code | concern | pass | pass | pass | yes | ok |  | QA-001 的模型缺失/执行占用与委托 Coding 失败已按界面语言说，但排队回答与 session_busy 两类宿主原因仍在英文页… |
| [#803](https://github.com/molis-ai/molis-work/pull/803) | pass | code | pass | pass | pass | pass | yes | ok | stacked，内容随 #789 进 main | 交付说明按已终止轮次给出，结果位先指它再指卡与这一轮；评审指出的 reconcile-required 越界已修，内容随 #789 进 m… |
| [#804](https://github.com/molis-ai/molis-work/pull/804) | concern | code | concern | concern | pass | pass | yes | ok |  | receive 升 v2 的代码、快照与身份归属都改对了；放置请求号的上限不一致和 quick-create §2 仍写旧形状是两处需要后… |
| [#806](https://github.com/molis-ai/molis-work/pull/806) | pass | docs | pass | n/a | pass | n/a | partial | ok |  | 评测记录完整、删行与文档同步；唯一的建议已写进手册正文，但没有独立跟踪项，不影响合并。 |
| [#807](https://github.com/molis-ai/molis-work/pull/807) | pass | code | pass | pass | pass | pass | yes | ok |  | 给模型补的这句有代码依据，开/关两条都被用例钉住，没有发现遗漏或逻辑问题。 |
| [#808](https://github.com/molis-ai/molis-work/pull/808) | pass | code | pass | pass | pass | pass | yes | ok |  | 合同包的内置名单与伴随表被干净地移到登记条目，API/文档/字节配套齐全，Projects 的必填登记只有两个构造点；合并内容与 PR 头… |
| [#809](https://github.com/molis-ai/molis-work/pull/809) | concern | docs | concern | n/a | pass | n/a | yes | ok |  | QA-007、QA-008 的每一处与 T0 依据都改到了，runbook 也没放松安全边界；但本 PR 自己留下“三行 vs 两行”的证… |
| [#810](https://github.com/molis-ai/molis-work/pull/810) | pass | code | pass | pass | pass | pass | yes | ok |  | QA-002 的两条同类修复与 QA-003 的编号齐全，过滤有用例、断言没有放宽，页面资源只降；合并内容与 PR 头一致。读了 Form… |
| [#811](https://github.com/molis-ai/molis-work/pull/811) | pass | code | pass | pass | pass | pass | n/a | ok |  | 三种拒绝各自说清原因，主人的原因只在合同确实通过时才带回；代码走读没有发现逻辑或规范问题。 |
| [#813](https://github.com/molis-ai/molis-work/pull/813) | pass | code | pass | pass | pass | pass | yes | ok |  | 纯搬运重构，逐行等价、事务与错误码不变，baseline 只降；评审建议由 S2-2 补齐。 |
| [#814](https://github.com/molis-ai/molis-work/pull/814) | pass | code | pass | pass | pass | n/a | partial | ok |  | 换包的字节、锁文件、来源记录与 S-13 都对得上，Molis 代码没有依赖被移除的旧行为；只剩两条非阻塞的文档建议未做。读了 prove… |
| [#815](https://github.com/molis-ai/molis-work/pull/815) | issue | code | pass | pass | concern | pass | yes | issue | 测试已由 #859 修复；AC-10-2 口径变更仍在 | 产品改动本身按评审修到位，但 PR 把从未跑过的浏览器用例合进 main，夜间全量随即变红、靠 #859 修；另外 AC-10-2 的验收… |
| [#816](https://github.com/molis-ai/molis-work/pull/816) | concern | test | pass | n/a | concern | n/a | partial | ok |  | QA-006 要的三种新失败路径都有用例，断言先证明核对请求发出再断言放过；但两条评审建议未落实，停下与超时用例的断言仍偏宽。 |
| [#817](https://github.com/molis-ai/molis-work/pull/817) | pass | docs | pass | n/a | pass | n/a | n/a | ok |  | 一句话把交付说明的出现条件精确到“人补充（及为它问的问题）”，与 deliveryNote 的实现一致。 |
| [#818](https://github.com/molis-ai/molis-work/pull/818) | concern | code | concern | pass | pass | pass | yes | ok |  | contracts 增加 agent-host 命名空间，文档/API 快照/用例同步，控制流无副作用；唯一遗留是用例名引用的 RCPT-… |
| [#820](https://github.com/molis-ai/molis-work/pull/820) | concern | docs | concern | n/a | pass | n/a | yes | ok |  | ADH-07 与 W3-02-G4-05 的两处修正本身成立；但 W3-02-G4-05 保留了不存在的 `projects.worksp… |
| [#821](https://github.com/molis-ai/molis-work/pull/821) | concern | code | concern | concern | concern | pass | partial | ok |  | 读了九个客户端 diff、request-client 全文、两份被改的 e2e、新用例与 baseline/page-assets；未逐… |
| [#823](https://github.com/molis-ai/molis-work/pull/823) | pass | test | pass | pass | pass | pass | partial | ok |  | 只加测试，钉住 QA-019 的 validateResult 时序与 QA-023 的取消/关闭零写，断言没有放宽；审阅的三条建议中两条… |
| [#824](https://github.com/molis-ai/molis-work/pull/824) | concern | code | concern | pass | pass | pass | partial | ok |  | 读了宿主点击判断全文、Pages/灵光被改的渲染段、spec、新用例和两处 e2e；未读 Pages/灵光完整文件。⌘/Ctrl 多选与中… |
| [#825](https://github.com/molis-ai/molis-work/pull/825) | concern | test | concern | pass | pass | pass | partial | ok |  | RAC-44/55/60 的逐部分拆分总体成立，但 RAC-44 ② 的用例证明不了「库来自 Home Runtime 声明」，① 的 p… |
| [#827](https://github.com/molis-ai/molis-work/pull/827) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 补上 QA-022 的提醒、待投递数和逐段失败隔离；产品代码只有一行具名导出，测试全量通过。 |
| [#832](https://github.com/molis-ai/molis-work/pull/832) | pass | docs | pass | n/a | pass | n/a | yes | ok |  | 交互线交接文档：18 个合入提交、BL-340～345、责任转移、§20 历史化和分支删除都经核实；无遗留。 |
| [#833](https://github.com/molis-ai/molis-work/pull/833) | concern | test | pass | concern | concern | n/a | partial | ok |  | PA-08/PA-17 的用例补上了交错、Run 计数、用量零增量与接续一次，断言没有放宽；遗留是 PA-08 通知只匹前缀、没钉拒绝原因… |
| [#835](https://github.com/molis-ai/molis-work/pull/835) | issue | code | pass | pass | issue | pass | yes | ok | 仍存在（编号冲突） | 读了 cancel-pulse-run 全文、action-operations 的 runCancel、client-views/cli… |
| [#841](https://github.com/molis-ai/molis-work/pull/841) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 删掉 Work 会话 HTTP 的无效 workspace. 前缀分支（行为不变），把 spec 的错码名改成 host.workspac… |

## 2026-10-20

| PR | 结论 | 类型 | 遗漏 | 逻辑 | 规范 | 防腐 | 评论 | 合并 | 处理状态 | 一句话 |
|---|---|---|---|---|---|---|---|---|---|---|
| [#771](https://github.com/molis-ai/molis-work/pull/771) | issue | docs | issue | n/a | concern | concern | partial | ok | 仍存在（文档建议多数 defer） | 文档主体与三条要改已落实，但新加的 Computer Use 面板说法与 2026-10-18 决定 A 不符，且八条建议（480/485… |
| [#776](https://github.com/molis-ai/molis-work/pull/776) | concern | code | concern | pass | concern | pass | yes | ok |  | P1 动作作用域修好，平台写入/投递的 S-18 改造完整，测试换成真实平台；唯一遗漏是 PPT README 仍描述插件手写每阶段复查（… |
| [#797](https://github.com/molis-ai/molis-work/pull/797) | concern | code | concern | pass | concern | pass | yes | ok |  | 场景/事件/输出/安装检查都在写前同步完成，Files 重试与 Git 通知修好，P1 门禁也过；两个独立发现：document-plug… |
| [#801](https://github.com/molis-ai/molis-work/pull/801) | concern | mixed | pass | concern | concern | pass | yes | ok |  | 两个创建入口与 pages.create@2 的合同/快照/测试基本完整，Y1/Y2/P1 都已落实；留一个一次性页面放行缺独立评审记录、… |
| [#812](https://github.com/molis-ai/molis-work/pull/812) | pass | code | pass | pass | pass | pass | yes | ok |  | 动作网关只认 Host 签发的插件调用者，Goals 内置名单删除，权限收窄到声明∩授权，嵌套调用与回调身份都有真实拒绝测试；评审的三项必… |
| [#819](https://github.com/molis-ai/molis-work/pull/819) | issue | mixed | issue | pass | pass | pass | yes | ok | 仍存在 | Issue 自己起标题的录入选路、模型授权、标题语言与视觉三态都实现并被测试覆盖；但固定追问 ISSUE_ASK 没有英文，英文界面会显示… |
| [#822](https://github.com/molis-ai/molis-work/pull/822) | issue | code | concern | issue | concern | pass | yes | ok | 仍存在 | 写后检查沿现有命令审批执行、按 run 记录检查器版本、S-42 的拒绝测试都到位；但执行器对写入路径不做规范化，./src/a.js 这… |
| [#826](https://github.com/molis-ai/molis-work/pull/826) | concern | code | pass | concern | pass | pass | yes | ok |  | 装配迁移、合同字段、资源放行与文档都按评审落地，合并树无丢失；只留一个派生层数的潜在缺口（clientFrom 与 clientUses … |
| [#828](https://github.com/molis-ai/molis-work/pull/828) | concern | docs | concern | n/a | concern | n/a | partial | concern |  | 文档事实、链接与编号大体可靠，交接里点名的提交都能在 main 找到；但交接的「全部合入」与 CU-G05 剩余项各有一处不精确，#819… |
| [#829](https://github.com/molis-ai/molis-work/pull/829) | pass | code | pass | pass | pass | pass | yes | ok |  | 会话从宿主核过的记录进到所有插件 Agent 的工具上下文与点建议执行，Goals、连接器、文档和测试都跟上；没有发现逻辑或合同漏洞，合并… |
| [#830](https://github.com/molis-ai/molis-work/pull/830) | pass | mixed | pass | pass | pass | pass | yes | ok |  | 三条 QA 的修复与验证齐全，让位、焦点和首开行为都有真实浏览器用例，资源下降且合并树无丢失；只留真实 Pages 390 的 1..2 … |
| [#831](https://github.com/molis-ai/molis-work/pull/831) | issue | test | concern | pass | issue | n/a | partial | ok | 仍存在（测试证据缺口） | 键盘、替身与通知入口的测试确实加强了，也没有删断言；但 QA-017 未覆盖实际打开、QA-018 的「主区页签」比较选错了 DOM 子树… |
| [#837](https://github.com/molis-ai/molis-work/pull/837) | concern | code | concern | pass | pass | pass | partial | ok |  | 核心代码与合同（身份、游标、幂等、@2）均成立；两处评审留下的文档记录没有最终落到 main 的记录里。 |
| [#839](https://github.com/molis-ai/molis-work/pull/839) | issue | code | issue | issue | issue | issue | partial | issue | 仍存在（安全/功能/合同多处）；main 红已由 #852 修 | 大 PR：读了 contracts/services/knowledge、horizontal/knowledge/src/{index,… |
| [#840](https://github.com/molis-ai/molis-work/pull/840) | pass | code | pass | pass | pass | pass | yes | ok |  | 生成目录、加载自检、门禁和 26 份登记都对齐；评审要求已落实，没有发现具体缺陷。 |
| [#842](https://github.com/molis-ai/molis-work/pull/842) | concern | code | concern | pass | pass | pass | yes | ok |  | 代码、权限与删除事件流都符合评审后的 B 方案；唯一具体瑕疵是标题/合并提交仍写 v2。 |
| [#843](https://github.com/molis-ai/molis-work/pull/843) | concern | code | pass | pass | concern | pass | yes | ok |  | 委托的控制流、拒绝路径、日志与文档都成立；剩一个安全编号文档冲突（connections 行仍预计 S-43）。 |
| [#844](https://github.com/molis-ai/molis-work/pull/844) | pass | code | pass | pass | pass | pass | yes | ok |  | Coding 的运行时选择从写死 prologue 改成读平台目录的能力矩阵；委派、方法与 MCP、整合、新会话都改到，评审三条建议均已落… |
| [#845](https://github.com/molis-ai/molis-work/pull/845) | concern | mixed | concern | concern | pass | pass | yes | ok |  | 提醒规则改为按已安装页面的 id 校验、宿主与设置页不再列插件名；评审的两处要改、建议以及最后的 @2 升版都已落地，剩下的风险是动作版本… |
| [#846](https://github.com/molis-ai/molis-work/pull/846) | pass | code | pass | pass | pass | pass | yes | ok |  | 材料服务新增 readDocuments，权限、失效、宿主校验和 API 快照齐全；评审的唯一建议已补测试，合并树与 head 一致。 |
| [#847](https://github.com/molis-ai/molis-work/pull/847) | concern | mixed | concern | concern | pass | concern | yes | ok |  | Pages 的动作、17 条路由、成果发布、模型和上传文件读取全部迁到 Plugin Runtime，宿主四个专用文件删除，发布授权与项目… |
| [#849](https://github.com/molis-ai/molis-work/pull/849) | pass | test | pass | n/a | pass | n/a | n/a | ok |  | 只补 e2e 的打包源文件，让工作区 override 的依赖缺口在测试里可解释；断言未动，合并正确。 |
| [#850](https://github.com/molis-ai/molis-work/pull/850) | pass | docs | pass | n/a | pass | n/a | yes | ok |  | 纯文档，编号、引用路径与来源核对通过；评审在合并前通过。 |
| [#852](https://github.com/molis-ai/molis-work/pull/852) | pass | test | pass | n/a | pass | n/a | yes | ok |  | 测试替身把知识后台整理作为旁路答复，修掉 #839 引入的脚本错位；断言没有被放宽，两轮补充都在合并树里。 |
| [#854](https://github.com/molis-ai/molis-work/pull/854) | concern | mixed | pass | concern | pass | pass | n/a | concern | stacked，未进 main（父 #851 open） | 控制流与 36 次按下的中位数/分位数证据核对一致（72/88/88→40/56/56 ms，处理 40→18 ms，样式 66→27 m… |
| [#855](https://github.com/molis-ai/molis-work/pull/855) | pass | code | pass | pass | pass | pass | partial | ok |  | provider_id 放宽到平台实际生成的外部 MCP id，精确匹配与逐次授权不变，测试和 spec 对齐；评审建议的常量/正则去重仍… |
| [#856](https://github.com/molis-ai/molis-work/pull/856) | concern | mixed | concern | concern | concern | pass | yes | concern | stacked，未进 main（父 #851 open） | 边缘渐隐与复制/折叠/数字的共享机制、消费者、预算数字和证据大体对齐；但 PR 只在 feature/visual-ux 上（#851 O… |
| [#857](https://github.com/molis-ai/molis-work/pull/857) | concern | code | pass | concern | pass | pass | partial | ok |  | L1a 的声明/检查/账本实现和快照都齐，评审的 5 条顺手改仍未落实（两条是错误路径），判 concern。 |
| [#858](https://github.com/molis-ai/molis-work/pull/858) | pass | test | pass | pass | pass | n/a | yes | ok |  | 一行测试跟上 #839 的产品变化，断言未放宽，可过。 |
| [#859](https://github.com/molis-ai/molis-work/pull/859) | pass | test | pass | pass | pass | n/a | n/a | ok |  | 修夜间浏览器用例的测量/序列化/键码问题，断言更严而非放宽，可过。 |
| [#860](https://github.com/molis-ai/molis-work/pull/860) | concern | mixed | concern | concern | concern | pass | n/a | concern | stacked，未进 main（父 #851 open） | 设计系统的复制/折叠/数字实现方向正确，但这是合进 feature 分支的 stacked PR、不在 main，且多处复制改为依赖可能未… |
| [#862](https://github.com/molis-ai/molis-work/pull/862) | concern | ci | pass | concern | pass | pass | partial | ok |  | 集成分支关 fail-fast/--bail、并行提到 10 的条件与文档一致，用户已批准；45 分钟分片超时的已知风险仍在，判 conc… |
| [#863](https://github.com/molis-ai/molis-work/pull/863) | pass | docs | pass | n/a | pass | n/a | n/a | ok |  | 首次使用与新建项目引导的需求书，事实路径、状态句与 ONB 编号齐全，可过。 |
| [#865](https://github.com/molis-ai/molis-work/pull/865) | concern | code | pass | pass | concern | pass | partial | ok |  | 等待确认继续时 Pulse/Lens 都能停，行为与用例都对；spec 仍引用仓库里没有出处的 D27，判 concern。 |
| [#872](https://github.com/molis-ai/molis-work/pull/872) | pass | code | pass | pass | pass | pass | partial | ok |  | 同文不重绘，保住选区，页面资源还小了 193 B；只剩评审提出的超长文本未来建议，可过。 |
| [#875](https://github.com/molis-ai/molis-work/pull/875) | pass | docs | pass | n/a | pass | n/a | yes | ok |  | 两条 BACKLOG 事实与上游 #56、代码上限一致，可过。 |
| [#877](https://github.com/molis-ai/molis-work/pull/877) | concern | code | pass | concern | pass | pass | partial | ok |  | 按库取授权的行为与拒绝测试都成立；validate_authority 与 installOf 的选库判断仍不一致（fail-closed… |
| [#882](https://github.com/molis-ai/molis-work/pull/882) | concern | code | pass | concern | pass | pass | partial | ok |  | partial 只放宽「声明了没提供」，登记只取自己那一半，测试与 spec 齐；outside_project 全听宿主的风险仍在，判 … |
