# 数据迁移、安全与恢复验证

## 目标、范围与完成等级

执行已接受的 assurance revision 1，产出迁移对账、恢复演练、安全边界报告，供最终 Cutover 使用。目标是已实现能力的内部可用保证，不实现未来 Server、在线备份或同步队列产品；不替代后续前后端用户 E2E。

## 已有证据和缺口

用户于本轮明确回答：“留到后续，本期只重组现有功能”。Outbox 的实现与重放验收留后续；本期仍完整验证既有事务、幂等、失败重试和恢复。此记录保存用户决定，正式 Molis Work Contract revision 另走统一提案；未落地前不按旧条件声称完成。

2026-09-06 当前源码的 16 文件定向回归 55/0/0：Goals schema/Web升级、Feed旧游标、Session/Ledger/Handoff迁移及回滚、Artifact版本、Plugin私有存储/失败恢复/授权、Session与Feed加密、Runtime和Connector恢复。日志 `/private/tmp/molis-work-assurance-baseline.log`。

尚缺一个跨数据库与加密 Blob 的完整离线恢复场景；单独验证文件可复制不是用户数据恢复证明。Storage 包仍 contract-only，没有现成通用在线备份实现。本轮测试采用停止全部写入后备份整个临时 Home，再在原绝对路径恢复，保留 Catalog 既有绝对项目路径语义；不声称跨机器搬家已验证。

## 场景与方案

新建临时普通 Project，经真实 Host Command 创建 Goal；由公开 Artifact API 保存两个版本的自定义内容，Session Registry 保存 Goal关联和私人正文。关闭 Catalog/Host/Registry/数据库连接后复制 Home，移走原目录，恢复备份并通过产品 API 对比 Project、Goal正文/历史、Artifact精确版本和 Session正文/关联。恢复后再写新事件，重开确认可持续使用。

补充缺密钥的失败场景：只对测试副本移走 content.key，生产内容服务必须拒绝读取和写入既有内容，不能生成新密钥掩盖损坏；恢复原密钥后原正文仍可读取。

输入是测试自产生的项目数据，不导入真实用户目录、凭据或 Team 信息。输出为定向集成测试与实际执行记录。测试只经公开模块或当前 App 装配入口调用，不新增业务 Store，不修改生产语义。

## 修改边界与验收

- 新增 `tests/home-backup-recovery.test.ts`；本目录记录证据，开发文档补离线恢复与密钥边界。
- 验收：原目录移走后完整恢复可读；准确保留 ID/版本/事件/正文；缺密钥拒绝且不轮换；恢复后继续写并重开成功。
- 验证：`node --import tsx --test tests/home-backup-recovery.test.ts`，相关现有回归，`git diff --check`。失败时先查实际调用与数据，不放宽断言。
- 全产品 UI、旧兼容入口及 Huge Class 清零、公开发布仍在后续阶段；本报告不自动通过这些要求。
