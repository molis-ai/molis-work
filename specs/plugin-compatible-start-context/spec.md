# 兼容实现启动上下文

目标：恢复旧项目中 Coding、Files、Git 的启动。实际项目安装版本低于当前明确兼容的实现版本，Runtime 将旧安装版本放入启动上下文，导致 Host UI 客户端以 `plugin_ui_denied` 拒绝启动；Artifact 与私有存储也有相同身份校验。

方案：Runtime 在启动及 crashed 恢复时，使用已解析、已通过兼容与权限检查的实际实现版本构造执行上下文。安装身份、已安装版本、Manifest 指纹和 grants 保持原值；停止、健康检查与撤销继续使用同一个执行上下文。不放宽各客户端身份校验，不自动升级或直接修改数据库状态。

范围：Runtime 上下文构造、合同注释、Host 集成回归和必要协议说明。验证真实 Host 的 UI、Artifact、私有存储可在兼容启动及恢复时工作，旧授权撤销仍生效，安装信息未升级；相关包构建及定向测试通过后重启开发 Web 服务，在报错项目检查插件状态并重新打开页面。

验证命令：`pnpm workspace:build`；`node scripts/run-tests.mjs tests/plugin-host-executor.test.ts tests/plugin-upgrades.test.ts tests/plugin-release-artifact.test.ts tests/plugin-private-storage.test.ts tests/plugin-runtime-integration.test.ts`。实际项目恢复不清理私有数据，不新增授权。

恢复入口：现有协议不允许普通启动自动复活 crashed 插件，保留该边界。为本项目 Native 插件增加受现有控制令牌保护的 POST restart 路由，调用 Supervisor.restart → Runtime.recover，沿用恢复次数与隔离限制。成功后同步 Coding 页面缓存状态；GET 与未授权请求不能恢复。通过此入口恢复本次三个已崩溃插件，不直接修改数据库。补 HTTP 权限和恢复后页面验证。

用户已授权继续恢复 Files（2026-09-23）。增加显式 `release-quarantine` POST 操作，调用带 `release_quarantine` 选项的 Supervisor/Runtime 恢复。只有 quarantined 状态接受该选项；正常重试、普通启动、页面读取仍不能解除隔离。成功恢复后重新开始恢复预算；失败保留隔离并撤销此次执行权限，安装身份、版本、指纹、原授权与私有数据保持原值。验证未授权/GET/普通重试拒绝解除隔离、显式失败不解除、成功恢复及后续普通崩溃恢复。

浏览器实测追加发现：Files 已恢复，但目录加载会同时请求 Diff，后者因同版本 Manifest 指纹变化被阻止，导致 Files 清空目录并显示错误。已对照实际安装指纹确认旧 Diff 1.3.1 的完整 Manifest 等于当前 Manifest 去掉兼容声明并将输入端口 `git-changeset` 还原为 `git_changeset`。Host 已按新端口重建绑定，数据类型、权限及输入组不变。为 Diff 1.3.1 显式补同版本兼容声明，保留旧安装指纹和版本；HTTP 回归预置该旧指纹，验证 Diff 可启动、Files 可读取目录，浏览器验证真实目录显示。

## 验证结果

工作区构建通过；Runtime/Host/版本升级/发行物/私有存储/隔离及 HTTP 定向回归 35 项通过。随后收紧无安装的解除隔离分支，12 项相关回归通过；补 Diff 旧指纹后，HTTP 与真实平台连线回归 8 项通过。`git diff --check` 通过。

实际项目 `project-466d6844-2a3b-47f8-a259-5edd4a1b931b`：通过受控路由恢复 Coding、Git，按用户明确授权解除 Files 隔离；当前 Coding 1.30.0、Files 1.1.0、Git 1.3.0、Diff 1.3.1 均运行，安装版本保留。开发 Web 已重启到修复代码，浏览器验证 Coding 面板正常、Files 列出真实目录并成功读取 README.md，已有对比快照正常显示。没有启动编码任务、生成新快照或自动升级安装版本。

## 2026-09-24：Builder 1.1.0 遗漏兼容声明

桌面打开插件创作工作台时，实际 Builder 安装版本 1.1.0 没有发行物存档，当前 Builder 1.2.0 仅声明兼容 1.0.0，故旧安装被阻止，状态接口返回 400。Files 与 Text Stats 均已匹配可用实现，错误来源已通过 Builder 接口确认。

方案仅补 Builder 对精确来源版本 1.1.0 的直接兼容声明，不修改 Runtime 的兼容边界或自动升级安装。Builder 使用相同的 `plugin-builder:state:v1` 存储键，当前读取器保留 builds/releases 并忽略旧 activeVersions 字段。实际项目数据库的临时副本（当前无草稿/发布）已验证兼容启动、读取不改私有数据、新草稿写读及版本/grants/指纹保留。补充带旧草稿、发布记录和 activeVersions 的 1.1.0 冷启动回归，验证 Host 首次归档当前兼容实现、保留历史并仍可编辑；同时运行 Builder 发布、Runtime 及发行物测试。

验收：Builder 状态接口 200，创作页可打开，安装仍为 1.1.0，权限及私有数据不变；构建并重启开发 Web 服务及桌面进程，使新代码实际生效。

验证结果：新增冷启动测试在修复前复现相同的 `plugin_release_artifact_missing`，补齐声明后 Builder 构建及 8 项 Runtime、发布、发行物回归全部通过。开发服务重启后，实际项目 Builder 状态接口和创作页均返回 200；浏览器已显示正常创作界面。数据库核对安装仍为 1.1.0、running，原 grants、Manifest 指纹及私有数据保持不变，已按现有机制归档可用实现。桌面进程已重新启动；页面实操验证来自浏览器，原生窗口未做自动化视觉验收。
