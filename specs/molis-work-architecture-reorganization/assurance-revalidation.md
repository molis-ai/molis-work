# 迁移、安全与恢复：执行前提复核

## Revision 2 当前复核（2026-09-06）

用户已明确批准恢复范围、DD收口与8个父项覆盖刷新。三份提案全部10项applied，最新cursor1293。Assurance同一Goal当前revision2，唯一条件变化是Outbox实现/重放后置，既有事务原子性、幂等、失败重试与恢复仍须验证。

本次按semantic_review完整读取23个当前Contract。八个前置父项均valid/satisfied且业务要求与提案前原样一致；Goals Query与相关叶项保持完成，DD已valid/satisfied。当前assurance的输入仍是已迁模块公开API、真实迁移路径及安装/恢复结果；Cutover消费本项完整保证，根要求仍保留最终架构退出及用户E2E。图检查0issues。不存在本次要求变化造成的缺失消费者或需要另改scope的Contract。

已实读三份93项测试日志的终态，55/35/3通过、无失败或跳过，并核对当前完整Home恢复测试确实移走原目录、调用产品API逐字段比对、写入后重开；缺密钥时读写拒绝、恢复原密钥后可读写。安装结果对应DV4已完成证据。复用先前执行，不伪称本轮重跑。此前coverage入口修复只涉及规划/澄清状态，不改这些迁移、加密、恢复或安装生产路径；其自身回归已单独记录。

本记录证明revision2的执行前提有效，后续仍需在当前执行Run登记全部三项完成证据并完成Review。下文是revision1历史，不能再用旧Outbox条件或旧覆盖门禁阻止当前执行。

2026-09-06。Goal `goal-7f442b3c-bf89-4696-ba50-721211740ff1` revision 1。

本记录只证明原任务仍可执行，不证明三个验收条件已经通过。没有改 Contract、父子覆盖或依赖。

## 当前依赖与消费

逐项读取八个前置 Contract：Artifacts/Ledger、Work/Runtime、Goals Query、Goals Mutation、Execution/Evidence/Governance、开发者集成分发、架构底座、Projects/App，当前全部 valid/satisfied。各自承诺的公开 API、现有数据迁移、恢复测试及安装产物仍是本项实际消费的输入。父项 coverage_revision_stale 的提示保持原样，不在本项中批准或修改覆盖关系；它们当前没有构成本项执行门禁，Available 唯一可领取项是本项 revalidate。

DV4 已完成完整 Review；当前干净 npm 消费、实际 App 升级/重装、安装失败回滚和源码退出证据见 `dv4-validation.md`。GW6 的历史 Goals schema 对账见 `gw6-validation.md`。这些输入降低重复检查，但不替代本项跨模块恢复与安全演练。

总 spec §13.5 第10项仍明确要求已迁移能力的前后对账、备份恢复、回滚、隐私和故障检查；本项结果由最终 Cutover 消费。没有新增 Server 功能或自动备份产品功能的授权，也不需要为了验证而增加新产品能力。

## 尚待执行的验收

- `assurance-migration`：跨 Schema、Project/旧 board、Goal、Feed、Session、Artifact、install state 的覆盖归并及补缺。现有 Session reconciliation 使用真实 catalog/registry，并保留失败整批回滚场景；还需实际运行核对。
- `assurance-recovery`：数据库与 Blob 一起备份恢复、Plugin 失败、outbox 重放、Runtime 断线和 install rollback。优先既有生产恢复接口；没有产品备份入口时验证停止写入后的完整数据目录恢复，不伪造在线备份能力。
- `assurance-security`：Storage scope、grant、Secret、路径穿越、私人内容和未授权入口。现有测试位置已找到，但文件存在不是通过证据。

所有测试只操作新建临时项目/Home。现用服务、原项目、Runtime 配置与真实凭据不在修改范围。整体前后端用户 E2E、最终旧代码清零和清理后重复 E2E 仍由后续总验收完成。
