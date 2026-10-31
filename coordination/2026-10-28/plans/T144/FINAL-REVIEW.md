# T144 工程书修订一：A–D 定点复核

**结论：通过，原 REVIEW A–D 必修在工程书层面已闭合；根可采用本候选书及内嵌 accepted §7 候选 diff。** 无新增必修，不要求重开全书或增加无关设计。仍 **WAIT T143 采用及共享 writer 锁**；采用工程书不等于实施放行、代码通过或 T144 完成。

本轮仅核同目录 PLAN.md 的 A–D 修订及关联的允许路径、验收、§7 候选 diff。对照上轮已读源码，并只回读 checkMaterials、AssistantInputs 的实际补充入口及 WorkExecutor 控制口。本轮本地 origin/main 为 `77f4fd172a380648535ac0f101bb2d6c8654c1bd`；相对原二审 `86570ac4499871f46c52762f73a1cd91f68ccc20` 的增量仅 Feed 和连接器测试，无本轮相关生产路径变化。T143 沿用已核最终合同，不重复审查。未实施、实验、构建、测试、fetch、改 refs、GH 或 coord；仅写本文件，未应用内嵌 diff。

| 原必修 | 修订后的具体合同 | 裁定 |
| --- | --- | --- |
| A 完整登记与生命周期 | plugin-instructions 纯函数一次组装旧 instructions、新角色 prompts/roles、顶层 methods 和可信 source；executor/lifecycle 复用同一 definition/安装 scope。lifecycle update 不增加 held，最后活跃实例释放才标整安装 disabled；项目当前可用性另核。失败升级按 Runtime 实际恢复 release 更新，迟到旧激活不能覆盖新版本。 | 关闭 |
| B 持久版本、用户覆盖和精确读取 | 完整版本只用 source.plugin_version；现有三表保存 default_ref/source_ref，save/reset/history/view/uses 同步，签名 default_updated 不再比较数字 1。角色有效正文带 effective/user_revision；顶层 methods 不新增编辑。列表、选择、checkMaterials、@2 读口与历史均携带精确引用，失配拒绝。 | 关闭 |
| C 实际交付前复查 | send 收集本次来源检查，自有 Runtime 新轮贯通 beforeStart/assertBeforeStart，运行中补充传到 inputs.send 最终口，执行方接 ExecutorControl，按需读在 context.beforeEffect 后同步核来源。检查只约束本次 handoff，不成为持续的跨插件整轮取消；明确 accepted 回执与历史边界。 | 关闭 |
| D 长度与身份 | 完整 SHA-256 派生 role/method/prompt token，原名只作显示；signed/entry_id 最长 78，符合 read 的 200 及 checkMaterials 两段 120/80 界限。签名分支不再按 plugin_id 长度截 id，身份/授权由完整来源及当前安装核定。 | 关闭 |

A 的验证已落到所有安装回调结束后，而非 executor.start 中间快照；混合真包、Home/项目启停重开、两个项目停一个、失败安装及升级补偿均明确。删除重复 agent.skills/agent_skills，保留 workspace:none 角色及顶层无工具 methods，没有新增 Agent 执行能力。项目 scope 的调整只服务同一完整登记，不把 T143 的 Home 模型服务范围扩展当作本片目标。

B 的 nullable 引用字段仍由 AgentDefinitions 单一 owner 管理，没有第二份版本账本；原生记录显式 NULL 并保留原数字语义。当前 schema/临时干净 Home 的恢复范围已写明，真实 Home 维护未被此书授权。角色使用记录与解析分开，工具 query 不新写 prompt_uses；只有取得有效交付回执的 send/handoff 才记冻结引用的使用。读到、接受输入和模型成功这三件事已有分别，不能在未来报告中混称。

C 已补出实际缺失的 assistant-service/dispatch/inputs/executor 路径，而不是仅声明“await 后复查”。补充文本原先逐项截 4000、再截总长，修订明确签名资料必须完整编码，超预算拒绝，不静默割断 JSON/署名/正文；这属于同一交付合同的必要关联修订。新轮、补充、工具三处 barrier 和有效 handoff 后撤销的正例，能分别证明未交付时拒绝与已有效历史保留。名称、用途、列表摘要和正文一同作数据，不留独立字符串插值的指令入口。

D 的最大中文/代理对名称、purpose 边界、跨 plugin/kind 同名区分，已要求真签包从列表、浏览器选择、checkMaterials 到读取/入模；独立摘要向量避免 helper 自证。长显示名不再被当成长协议 id。

内嵌 §7 diff 与上述工程选择一致：保留原 RAC/S 号、D5/D6、角色资料与方法的区别、完整来源、不扩权、项目升级和 Home 现有能力边界。原先等待再次裁定的两项语义已按根决定固定，独立旧 T144 文书未找到也不再增加门槛。精确允许路径是上限，不意味着必须全改；后续测试仍按实际 diff/README 收口，Full 与共享锁由根排。

本次通过只表示可按这份工程书实施与验收。所有代码行为、真实签包、故障注入、CI/Full、真实 AI 体验与用户验收均仍待后续证据；BL916/T141/T145 未因本次审书被采用或展开。

— Codex，T144 原二审 A–D 定点复核，2026-10-31
