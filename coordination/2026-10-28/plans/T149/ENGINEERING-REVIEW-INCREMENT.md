# T149 + BL-589 三项必修增量复核

**结论：三项必修均已在工程书中闭合，可采纳当前修订版为 WAIT 工程书；没有剩余必修，不再增加审查轮次。** 此结论只表示书面方案闭合，不表示代码已实现或验收通过。

本轮只回读修订后的同一 ENGINEERING.md，对照前次 ENGINEERING-REVIEW.md 的三项要求及已核源码事实；不重新审查已认可的密钥归属、S84、旧项目身份或其他产品边界。未实现、构建/测试、读取真实 Home/凭据、改 refs/仓库/协调/GitHub；本轮仅写本报告。

| 原必修 | 修订落点与判定 |
| --- | --- |
| 实际 workflow 的 effects 唯一 owner | **关闭。** §2 已补 agent-validation 的 contractEffects 与 workflow 构建/发布两处调用；删除重复循环及旧导出/wrapper，直接使用 SDK effectsFromContract。§6 SDK-1 进入真实 workflow，独立固定期望检查 BuildManifest.effects，且明确合法的跨操作重复。允许路径已同步，未迁无关设计校验。 |
| 发布 revision/scope/authority、同 CAS 资格与中断重试 | **关闭。** §3 捕获可信归属、revision、scope、候选检查与版本，持续控制经窄发布端口传递；等待后和持久化前复核。store.release 在同次读取/CAS 内核存在性、revision、资格、scope 和版本唯一性，最终同步段不插 await。文件提交后中断由下一次本人显式发布、同 release owner 串行回读引用后处理；有引用不删，无引用且归属明确才清理重试，不复活失效授权，不删 key 或其他胜者。PUB-2/PUB-3 已覆盖真实交错与生产提交边界，未用测试脚本自己 CAS 代替。 |
| Home scope 进入真实检查/试用，不能借项目旧绿 | **关闭。** §5 改选 Home 更新目标/revision，使旧项目通过状态不再适用，停止旧 runner；Home 检查、替身及真实试用共用可信 Home 目录与 projectId=null，缓存键含 scope，不启用项目插件补能力。按目标重验之后才取得发布资格，发布自验含 Home admission；试用不 pin、不安装。SCOPE-1 同时覆盖项目独有能力的拒绝和合法私有存储 Home 样本，§7 已补 studio-preview、store 与模型表达的必要路径。 |

三处修改都落在原发布链、现有 store 和检查/试用流程内，没有引入通用任务账、分布式锁、恢复 manifest 或第二套生成器。具体 Host 目录/服务注入与最终字段形状仍由根在实施基点冻结；这是书中已经明确的工程交接，不构成新的产品问题或另一次审书门槛。

**WAIT 保持：** T141/T143 最终采用基点与真实接口、T144 实际采用顺序及相应声明输入、共享文件锁/保护路径隔离、单 writer 和根的实施排期。不得把这次书面闭合写成 READY、实现完成、运行验证或真实用户验收。其余已认可内容保持原结论。

— Codex，T149 + BL-589 独立增量复核，2026-10-31
