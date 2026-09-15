# 迁移、安全与恢复：当前验证结果

## Revision 2 验收映射（2026-09-06）

恢复范围提案已由用户明确确认，cursor1270 applied；当前canonical revision2已将Outbox实现/重放留后续。以下93项既有生产路径执行证据与安装证据继续适用，日志终态和关键恢复源码本轮重新核对，未重跑无变化的成功测试。

- `assurance-migration`：下表Goals/Feed/Session、Project/旧board、Artifact及DV4安装状态对账与故障回滚覆盖全部数据类别；无只比ID或只证明文件存在的替代。
- `assurance-recovery`：完整Home恢复/缺密钥两场景、Plugin生命周期失败和恢复、事务失败整批回滚、Connector幂等及游标提交、Runtime终止/重建与Handoff重试，以及DV4实际安装失败回滚均有行为证据。
- `assurance-security`：真实HTTP控制门禁、项目/Plugin grant隔离、密钥/正文保护、跨项目和路径穿越拒绝对应已实现能力；不把受信任进程内Plugin误称OS安全沙箱。

本项完成等级为现有能力的内部迁移、安全与恢复保证。全产品真实用户E2E、旧Host/Store退出与Huge Class治理仍是Cutover与总目标的未完成工作。以下revision1“范围未落地/入口受阻”记录均为历史。

2026-09-06。工程验证已有进展，Goal 尚未完成；原 revision 1 的 Outbox 条件不能当作已通过。

## 用户范围决定

用户针对“Outbox 实现与重放验收是否留后续，本期仍验证既有事务、幂等、失败重试和恢复”的唯一问题回答：**“留到后续，本期只重组现有功能”**。这不排除原有功能的安全、恢复、架构清理和完整用户 E2E。

仓库事实：当前 `packages/storage/src/index.ts`、`packages/exchange/src/index.ts` 只有 contract-only descriptor、capabilities=[]；Storage Contract 仅 descriptor 与已有事件类型；ContextMaterializer 同步读取当前 owner，不是持久队列。重组前 `32c22e2` 的 src/tests 对 outbox 大小写搜索也无结果。总 spec 曾把目标架构的 Outbox 和现有能力混写，本次不以 Connector retry 或 Session handoff retry 冒充 Outbox 测试。

## 生产路径验证

| 范围 | 实际证据 | 结果 |
| --- | --- | --- |
| Goals/Feed/Session 历史迁移 | Goals v30 前后对账、真实 HTTP 打开旧项目、旧 Feed 游标、Session v1/v3/v4/v5 与 Ledger/Handoff 转移、注入失败整批回滚 | 通过，baseline 组 |
| Project/旧 board | 普通项目隔离、完整旧 DB 迁移、失败保留旧数据无孤立记录、未来 schema 拒绝且不改写、context binding 升级 | 通过，recovery-access 组 |
| Artifact | id+version 两版本 opaque payload、producer/owner/授权、错误digest不写、跨项目 HTTP 不可读、原工作区引用 | 通过，两个组 |
| 私人内容及密钥 | Session正文不以明文落盘、metadata去敏、Feed凭据与正文加密、错误/缺失密钥拒绝、Relay迁入后正文/凭据保留 | 通过，baseline 组 |
| Plugin失败/撤权 | reportCrash/recover 与 start/stop 抛错、UI撤销、旧client不可继续读写、私有数据跨重开保留、签名隔离；包篡改与不安全文件拒绝 | 通过，两个组；是受信任进程内生命周期，不是 OS 沙箱 |
| Runtime/Connector失败 | 真实PTY退出/新spawn、订阅清理、Handoff发送失败与重开恢复、不明远端结果不盲重发、Connector游标成功后才推进、重复不新增Item | 通过，baseline 组；Provider为受控fixture，非真实外部账户 |
| 完整离线恢复 | 新增 home-backup-recovery 测试：关闭全部写入，复制整个临时Home，移走原目录，恢复到原路径，经产品API读Project、完整Goal snapshot/事件、Artifact两个版本、Session Goal关联和加密正文；新事件写入并重开仍在 | 通过，recovery-access 组 |
| 不完整密钥备份 | 移走测试 content.key 后读取及新内容写入均拒绝；恢复原密钥后旧正文及新写入可读 | 通过，recovery-access 组 |
| 外部/越权访问 | 真实 HTTP 跨站、缺凭据、hostile Host、重复写拒绝；本地PTY带token才可用；Artifact/Session跨项目隔离、路径穿越拒绝 | 通过，control-gate 与 recovery-access 组 |
| 安装状态与回滚 | 复用刚完成的 DV4 当前 npm安装/版本切换/失败回滚、真实App旧版升级、普通卸载保留、实际重装与服务恢复证据 | 见 dv4-validation.md，不重复本轮无变更的安装演练 |

三组互不重复的执行记录：

- `/private/tmp/molis-work-assurance-baseline.log`：16文件，55 pass / 0 fail / 0 skip。
- `/private/tmp/molis-work-assurance-recovery-access.log`：7文件，35 pass / 0 fail / 0 skip，含新增2条恢复测试。
- `/private/tmp/molis-work-assurance-control-gate.log`：按名称选择3条真实Web/PTY控制测试，3 pass / 0 fail / 0 skip。

共93条通过。测试只操作自己新建的临时数据与服务，不读写现用项目；测试进程全部结束。新增测试只验证现有产品API，未修改生产业务语义。中英文安装文档补充完整Home、原绝对路径、外部工作区和Keychain/环境密钥的恢复边界。`git diff --check` 通过。

## 不能据此声称完成

- 通用Storage scope的最终运行时隔离与旧 raw连接退出仍需最终架构清理核对；这里的Plugin/Project访问测试不能替代全仓检查。
- 没有在线备份、跨机器密钥恢复、新Outbox、Server/Team同步实现；用户已把Outbox留后续。
- 全产品真实用户前后端E2E、旧类/兼容路径清零和清理后重复E2E尚未完成。

## 正式范围落盘受阻

revalidation 已成功恢复本项 valid/unmet（cursor1244），并非完成。工程执行Run `run-69a9b793-0699-4663-85ae-5943821d35aa` 已于09:36:19 UTC终止并释放，原因是转用户确认的范围修订，历史证据未改写。

读取变更影响后，根Goal的统一projection提供 `clarify / ready / target_type=coverage`；使用该原样 action_id/token 与 clarifier 调用 select 却返回 `goal.clarification_not_needed`、allowed=false、无Claim/Run。随后 explain(role=clarifier) 同样ready=false。未重复写入，未改数据库、换Actor、造临时Goal或用执行者修改Contract。**用户范围决定已在此保存，但 canonical Contract 仍为revision1；需要修复正式澄清入口冲突后再提交仅该验收范围的修订。** DD独立待决定项不包含在本次用户回答中。
