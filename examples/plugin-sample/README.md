# Molis Work 本地插件样例

这个目录不在 production workspace，也不进入产品发布链。它只导入公开 SDK，不读取仓库内部源码、用户文件或 Runtime 配置；不会请求网络或自动向 Team 分享。

每次 poll 会生成一个个人 Artifact 版本、按 type/schema 读回该版本，并保存私人计数。UI 显示已保存数量。崩溃后恢复原计数；卸载移除 UI，已交换的 Artifact 不删除。

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
