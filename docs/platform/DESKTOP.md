# Desktop App 与 Tauri 边界

状态：AP4/DV4/Cutover 已迁入并完成本地 App/DMG 安装和真实窗口验收；本轮未做公开发布或公证
公开 package：`@molis-ai/molis-work-app-desktop`

## 1. 大白话说明

Desktop 是 Molis Work 在 macOS 上的“外壳和控制台”。它负责开窗口、启动本地 Runtime、管理终端面板、显示菜单栏 Capsule，并在本地服务暂时不可用时恢复连接。它不判断 Goal 是否完成、不保存 Project 正式事实，也不复制 Feed、Session 或其他 Module 的业务规则。

例如，用户从一个 Goal 打开 Codex 面板时：

1. Desktop 根据 Runtime 类型生成启动命令和环境变量。
2. Desktop Panel Service 检查用户确认、工作目录和面板生命周期。
3. Project/Context port 只负责确认 Project 存在并记录关联；Desktop 不直接读取 Projects Store。
4. Tauri Adapter 启动 PTY、控制窗口，把输出交还给现有 Workbench 页面。

## 2. 代码各管什么

| 路径 | 职责 | 不负责 |
| --- | --- | --- |
| `apps/desktop/src/launch.ts` | Runtime 启动配方与面板环境变量 | 启动进程、保存 Session |
| `apps/desktop/src/advance-prompt.ts` | 当前 Goal 的推进提示，复用 Feed Plugin 的外部内容脱敏 | 解释或保存 Feed 数据 |
| `apps/desktop/src/shell.ts` | 识别原生 Desktop 请求并保持本地链接的 `desktop=1` 上下文 | 页面业务渲染 |
| `apps/desktop/src/panels.ts` | 面板打开、关闭、状态、别名和用户确认规则 | SQLite、Project 事实、PTY |
| `apps/desktop/src/capsule-shell.ts` | Capsule 的 HTML、CSS、浏览器脚本和壳层交互 | Goal/Run 状态组合 |
| `apps/desktop/adapters/tauri/` | 窗口、菜单栏、PTY、本地 Web 服务启动与恢复 | Module 业务规则 |
| `apps/desktop/src/adapters/sqlite-panels.ts` | Desktop Panel SQLite Repository | 面板业务判断 |
| `apps/desktop/src-tauri/` | Cargo/Tauri 配置、权限和打包资源 | Desktop 业务源码 |

旧 `src/desktop/` 与 `src/web/desktop-shell.ts` 已删除；caller 使用 `@molis-ai/molis-work-app-desktop`。

## 3. 与其他边界怎样合作

- Projects Module 只拥有 Project 身份和正式事实；Desktop Panel 是 App control state，不进入 Projects Module。
- Private Work Context 拥有 Session 和 Runtime workspace 关联；Desktop 只保存面板到稳定 work context 的别名。
- Runtime Host 拥有通用 Runtime stream、重连和中断；本地 PTY 通过 Runtime Host 与 Desktop adapter 接入。
- Workbench 提供共享页面壳；Desktop Capsule presentation 由 Desktop App 提供，Workbench 组合 read model，Local Host 注入主题与语言。
- Feed Native Plugin 拥有外部内容脱敏规则；Desktop 推进提示直接调用其公开 API，不复制一份规则。

## 4. 当前真实能力

AP4 保持并迁移了以下既有能力：

- Desktop 启动、关闭隐藏、窗口恢复和本地服务重连。
- Codex、Claude Code、OpenCode、Pi、Grok 与自定义命令的启动配方。
- 面板打开/退出/重开/关闭、Session alias、Project 关联和 PTY 生命周期。
- 菜单栏状态、Capsule 定位/显示、项目切换、主题与中英文 locale。
- 内置 Molis Work Runtime 的版本比较、升级安装与 owned service 配置修复。
- Tauri command 的显式 permission allowlist。

当前产品没有系统级通知实现：界面中的通知按钮原本就是“暂不可用”的禁用占位。Desktop 也没有独立 Keychain adapter；Feed 的现有 credential backend 仍由它自己的 Host 接线管理。AP4 不把不存在的功能伪装成已迁入。将来实现系统通知、Keychain 或 App 自更新时，应作为 `apps/desktop/adapters/tauri/` 的受控 adapter 接入，但权限策略和业务判断仍由调用它的正式 owner 决定。

## 5. 当前退出与发布状态

原混合 Tauri main.rs 已按窗口、菜单、服务、面板等职责拆分；旧 Desktop 转发、Catalog 面板兼容方法与 Web Capsule 文件均已删除。Panel 持久化 Adapter 归 Desktop，Catalog 通过公开端口装配；Session 与 Runtime 规则归各 owner。

`apps/desktop/src-tauri/` 保留 Cargo/Tauri 发布配置和资源。最终 App、DMG、zip 与 ad-hoc 签名已构建，DMG 安装至临时目录后真实启动、退出并恢复原服务。没有升级现用安装，也未进行 Developer ID 公证或公开发布。

历史分工见 [AP4](../../specs/molis-work-architecture-reorganization/ap4-validation.md)，最终证据见 [Cutover 验证](../../specs/molis-work-architecture-reorganization/cutover-validation.md)。
