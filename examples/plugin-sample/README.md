# Molis Work 本地插件样例

这个目录不在 production workspace，也不进入产品发布链。它只导入公开 SDK，不读取仓库内部源码、用户文件或 Runtime 配置；不会请求网络或自动向 Team 分享。

v2 Manifest 注册三项动作：`health` 提供公开健康查询；`results.read` 读取本地用户的私人计数与最新个人 Artifact；`results.publish` 保存下一个版本。处理器直接使用 Manifest 中的同一份合同，调用前后经过共同服务和安装权限校验。

每次 poll 调用同一个注册的 `results.publish`，按 type/schema 读回具体版本并保存原私人计数。UI 显示已保存数量。崩溃后恢复原计数；卸载撤回动作和 UI，已交换的 Artifact 不删除。

健康查询可以单独授权给 MCP/工作流。个人结果的两项动作仅允许本地用户入口，并通过 `bindOwnerPluginAction` 检查真实调用者，不能用外部客户端身份借用启动用户的个人数据。这个样例不宣称已解决跨调用者的个人 Artifact 归属。

`manifest.json` 中的 `local-development-binding` 仅用于明确本地开发身份，不是官方审核、密码学签名或发布证明。不要将本样例冒充官方可安装发行物。

## 已验证的运行方式

直接运行方式见[插件开发指南](../../docs/platform/PLUGIN-DEVELOPMENT.md)：`molis-work plugin dev` 接受源码目录、独立开发状态目录、明确 grants 和未签名源码执行授权。构建后也可运行 `node --import tsx --test tests/plugin-sample.e2e.test.ts`，测试实际执行 CLI create、pnpm pack、离线安装 SDK/Contracts tarball，并通过应用 CLI 在两个独立进程运行、恢复计数，核对权限拒绝、版本不兼容和普通目录保护。另一条真实 Host 调用链验证 crash/recover/uninstall。

SDK 当前版本为仓库开发版本 0.0.0，尚未宣称发布到 npm；请安装同一次构建得到的本地 tarball，不要依赖 registry 上存在同名发行物。

## 模块分工

- Plugin SDK：作者 API 与 Manifest 定义。
- Plugin Runtime：安装身份、权限、生命周期与私有存储。
- 官方 Artifacts Plugin：绑定当前用户/项目后生产、消费具体版本；内容规则仍由 Artifacts Module 维护。
- UI Host：注册与挂载，Local Host 在停止/失败时撤销 UI。

完整范围和未完成项见 [DV3 工作计划](../../specs/molis-work-architecture-reorganization/dv3-work-plan.md)。这不是整体产品用户 E2E 的替代品。
