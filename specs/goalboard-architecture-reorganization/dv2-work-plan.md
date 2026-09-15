# DV2 — Skill 与 Runtime 正式协议迁移

日期：2026-09-05。依据 Molis Work accepted `goal-reorg-dv2` revision 1 与总 spec 的 DV2 定位，不另改 canonical 范围。

## 目标与证据

Runtime 能通过公开 MCP 完成项目连接、Draft 澄清、方法读取、用户决定、执行、Evidence/Review 与恢复；Skill 不读取数据库、不依赖 Web route 或 Coordinator。保留现有工具名称、参数、用户权限、幂等和返回字段。

当前 Skill 主体已只调用 MCP，37 个方法正文已由 Goals Module 资产提供；但中英文 MCP/Runtime 文档仍介绍已移除的 `workspace_default`，并要求正常完成后手动 complete/release。Skill protocol 中的“每次写后重读”与 transition receipt 指导冲突，连接参考的目录默认提示也与其自身唯一已验证 membership 恢复说明冲突。实际安装接入中的 stdio MCP handshake 仍嵌在 1,448 行 `src/install/runtime-integration.ts`，属于本项可独立迁移的协议适配，而安装确认/备份/回滚由 DV4 负责。

## 范围与模块边界

1. 修正仓库 Skill 的上述旧假设，明确只消费工具公开结果、以返回 transition.projection 继续；不复制整份 schema 或内部数据类型。不修改安装在用户目录中的 Skill。
2. 中英文 MCP/Runtime 文档对应当前连接、用户确认的 Contract revision、自动释放/完成、同 key 恢复与公开 owner；保留普通入口无 Web 前置条件。方法正文继续唯一位于 Goals Module，不复制到 Skill。
3. 将现有 launcher handshake/timeout 迁到 `apps/mcp` 的具名公开 validator；原 Runtime Integration Service 调用此公开函数，保留验证上下文兼容类型。只迁原 initialize/tools-list/失败/关闭行为，不扩大 launcher 接入权限、修改配置格式或改变验证标准。
4. 补实际协议流程验证，消费公共工具回复，不依赖 Store/Coordinator 组装业务状态。用临时项目和临时 Runtime home，验证恢复、幂等、用户决定及最后可观察状态；保留已有权限/方法正文/安装回滚测试。

非目标：不新增工具/业务、改模型、升级用户安装包、修改真实 Runtime 配置；不在本项迁移完整安装事务或配置 parser，不以此宣称 DV4 完成。最终用户 E2E 仍在整体开发后进行。

## 输入输出与验证

输入为已有 Runtime 工具 schema、宿主身份和 launcher validation context；输出为同一协议回复/布尔健康结果、更新后的 Skill/references/开发说明及真实协议测试。公开 Contract/现有 owner 继续执行验证、事务、身份及幂等。

完成等级：本切片功能可用并验证安装接入兼容，不声明整个产品可发布。

- `dv2-boundary`：Skill 与 validator 无内部 Store/Coordinator/Web route；公开入口和有限上下文类型。
- `dv2-legacy-exit`：旧 handshake 从安装 Huge Class 退出，实际 caller 切换；旧目录默认和手动完成假设退出当前说明，历史文档不当作操作指南。
- `dv2-result`：MCP 主流程、方法正文、确认/恢复/幂等与接入成功/失败验证；新 validator 实际执行子进程而非仅比定义。
- 命令：MCP build、根 TypeScript、`tests/runtime-integration.test.ts`、`tests/mcp.test.ts`、新增 Runtime 流程测试、`pnpm boundary:check`、`git diff --check`；技能 frontmatter 检查只作为辅助，不代替行为验证。

开放问题：当前安装 host 的 reader 3/schema 5 需在 DV4 发布物更新后做真实恢复；本项不以切换数据库绕过它。若发现公开协议无法表达原主流程，先定位原调用链，不新增平行 lifecycle。

## 交付记录

四项范围已实现；66 项针对性回归、构建/类型和边界检查通过。逐条验收、caller 对账及仍待 DV4/整体 E2E 的边界见 [DV2 验收报告](dv2-validation.md)。
