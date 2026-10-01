# Runtime 安装包文件边界：完成记录

## 结果

Home 安装与 App Runtime 打包不再递归带入桌面构建缓存和旧包。workspace 包按声明的 `files` 分发；第三方包保留完整运行文件，仅排除已平铺的顶层 `node_modules`。摘要与复制共用同一发布文件范围，现有 npm staging 复用该文件清单能力。

实现集中在 `apps/local-host/src/installer/package-release-files.ts`、`home-release.ts`、`home-source.ts` 和 `npm-package.ts`。没有改变 Goal 业务、Runtime 协议或数据库迁移。

## 验收

- **通过**：公开 Home 安装与 Runtime payload API 保留声明的代码、methods 和原生包文件，排除 target 与旧 payload；安装产物的入口实际运行成功。
- **通过**：仅修改未分发缓存不会刷新同版本安装；修改已分发代码会刷新，安装后运行入口读取到新内容。
- **通过**：缺少声明资产或包含不支持的发布模式时明确失败；原有依赖平铺、外部链接拒绝、失败恢复和 npm staging 检查保持通过。
- **通过**：完整 `pnpm build`；完整测试命令 `env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 tests/*.test.ts`，647 项通过，0 失败、0 取消、0 跳过。
- **通过**：`bash apps/desktop/tooling/prepare-macos-runtime.sh` 与 `APPLE_SIGNING_IDENTITY=- pnpm --dir apps/desktop exec tauri build --bundles app --ci`。Runtime 约 277 MB，最终 App 约 260 MB；版本 0.2.0，内部签名验证通过。
- **通过**：本机两个已有 App 位置和 Home 升级到 0.2.0；常驻服务恢复运行，已接入的三个 Runtime 更新并通过新 MCP 连接验证。
- **通过**：15 个旧项目副本升级后，459 个 Goal 状态可读，原有业务记录完整；实际安装版随后正常打开全部项目，目标数量一致。桌面窗口可阅读旧目标和原始历史记录。

首次完整测试在受限环境中遭遇 `listen EPERM` 和浏览器启动限制，不能作为功能验证结果；上述 647 项结果来自具备本地服务、PTY 和浏览器所需权限的完整重跑。

## 发布边界

本机安装前已停止旧写入服务并完整备份 Home。新旧 Runtime 会话需要重开才能加载新版工具与 Skill。0.2.0 的公开 Release 提供标签、源码和变更日志；本机 App 为内部签名构建，公开 macOS 安装包仍需 Developer ID 签名和 Apple 公证。

本修复合同没有未完成的验收项。
