# AP3 Workbench / UI Host / Design System 迁移验收记录

日期：2026-09-02  
Goal：`goal-reorg-ap3`  
完成等级：AP3 切片达到“内部完整”；整个架构重组仍在继续

## 1. 结论

AP3 已把稳定文档 Shell、命名 UI Slot、Contribution mount 校验、浏览器静态资产和视觉基础迁入各自公开 package，并保持现有 Web/Desktop 行为不变。

这不等于所有产品 UI 已经迁完。`src/web/render.ts` 当前仍有 6,239 行，承载 Goals、Execution、Artifact、Work 和 App Shell 的兼容页面；它们分别属于 GW5、EX4、AR3、WK3、AP4，不能由 AP3 为了减少行数而吸收到 Workbench。本次完成的是旧 renderer 中属于 UI 平台的职责退出，不宣称旧 renderer 已整体 retired。

## ap3-boundary

### 公开边界与依赖方向

### 新 owner

- `apps/workbench`：稳定 HTML document Shell、`workbench.directory` / `workbench.main` / `workbench.overlay` 三个命名 Slot、浏览器 CSS/JS 资产装配。
- `packages/ui-host`：Contribution registry、surface 查找、目标 Slot 和 format 兼容校验、mount 结果。
- `packages/design-system`：主题、密度、终端主题偏好、browser bootstrap、通用视觉和可访问性样式。
- `plugins/native/feed`：Feed 产品 surface 及其目标 Slot 声明；Workbench 只通过 UI Host mount。
- `packages/contracts/platform/ui`：`UiSurfaceDescriptor`、`UiMountRequest/Result`、`UiHostApi.mount` 和 Workbench document request。

### 禁止依赖审计

- Workbench、UI Host、Design System 源码没有 `MolisWorkStore`、`MolisWorkCoordinator`、业务 Store/implementation 或旧 `src/` deep import。
- UI Host 只理解 contribution、surface、slot、format，不理解 Feed、Goal、Artifact 或其他产品数据。
- Workbench 只装配公开 contribution；Feed 产品 renderer 仍由 Feed Native Plugin 拥有。
- `pnpm boundary:check`：48 packages、143 source files、231 imports、55 dependency edges、16 个有 owner 的旧兼容条目，0 errors。
- `pnpm workspace:check`：48 package names、30 Contract subpaths，0 errors。

### 关键自动化测试

- Workbench document metadata/attribute escaping。
- UI Host 接受声明过且 Slot/format 兼容的 surface。
- 未声明 surface 返回 `ui_surface_invalid`，错误 Slot 返回 `ui_slot_incompatible`。
- Feed Native Plugin 的 surface 只挂到三个稳定 Workbench Slot。

## ap3-legacy-exit

### 旧 Huge Class 职责退出

| 旧文件 | AP3 前 | AP3 后 | 已退出职责 | 仍保留什么 |
| --- | ---: | ---: | --- | --- |
| `src/web/render.ts` | 14,028 行 | 6,239 行 | document Shell、Design System import ownership、browser CSS/JS 常量和装配 | 后续 Native Plugin / App Shell Goal 的产品页面兼容实现 |
| `src/web/visual-foundation.ts` | 7,979 行 | 15 行 | 主题偏好、browser bootstrap、视觉与可访问性样式 | Design System public re-export |
| `src/web/i18n.ts` | 3,710 行 | 140 行 | 3,574 行 EN catalog 与语言 runtime 的混放 | locale 选择、fallback、翻译 runtime 和 Workbench catalog public import |

迁移后的大块内容没有再藏入一个同等规模的新类：

- Workbench browser assets 按 base/workbench/responsive/project/settings 样式层，以及 control/settings/work-tabs/client lifecycle 职责拆分。
- Design System 按 preferences、foundation、momentum、quiet-paper、desktop/personal shell、directory/navigation/source 等视觉层拆分。
- `apps/workbench/src/i18n/en.ts` 仍是 3,574 行兼容 catalog，这是透明记录的待迁内容。它不包含 runtime 或业务调用，后续随 GW5/AR3/WK3/AP4 的产品 UI 就近拆出。

兼容结果对账：

- 迁移前后 `VISUAL_FOUNDATION_STYLES`、client script 和 theme bootstrap 逐字节相同，共 360,094 个字符。
- 迁移前后 15 个 Workbench browser asset 常量逐字节相同。
- `src/web/render.ts` 不再定义 `CLIENT_SCRIPT` 或 `VISUAL_FOUNDATION_STYLES`，也不导入 Store/Coordinator。
- `src/web/i18n.ts` 已退出 legacy huge-file allowlist；旧 visual foundation 只保留可删除的 public compatibility facade。

## ap3-result

### 功能、状态与回归结果

### 用户可见行为

- 现有 Web 与 Desktop 仍使用同一 Workbench 页面和浏览器交互。
- Shell、导航、Feed contribution、Goal Tree、Settings、Onboarding、Desktop tabs、PTY 和响应式行为保持兼容。
- Theme、density、terminal theme、本地偏好、focus-visible 和 reduced-motion 规则保持不变。
- Plugin surface 现在必须先声明装载位置；错误声明会被 Host 明确拒绝，不会静默插入错误区域。

### 验证命令与结果

| 验证 | 结果 |
| --- | --- |
| `CI=true pnpm typecheck` | 通过；全部已迁 package build + 根 TypeScript 检查通过 |
| AP3/Feed/Web/Desktop 定向测试 | 144/144 通过 |
| `CI=true pnpm test` | 504/504 通过，0 fail / 0 skipped |
| `CI=true pnpm workspace:check` | 通过；48 packages / 30 Contract subpaths / 0 errors |
| `CI=true pnpm boundary:check` | 通过；0 errors |
| `git diff --check` | 通过 |

定向测试包括真实本机 Web/PTY 端口、浏览器布局脚本、Goal Tree、Settings、Onboarding、Desktop tabs、Feed UI、视觉 foundation 和 AP3 新 Contract 测试。CSS/JS 逐字节对账与既有浏览器布局测试共同覆盖本次“无损迁移”的视觉和交互回归；没有借 AP3 改视觉设计。

## 5. 验收标准对照

| Criterion | 状态 | 证据 |
| --- | --- | --- |
| `ap3-boundary` | 通过 | 三个 public owner、公开 UI Contract、无 Store/Coordinator/deep import；workspace/boundary checks 通过 |
| `ap3-legacy-exit` | 通过（按 AP3 职责） | Shell/DS/UI Host/browser assets 已退出旧 renderer；行数与逐字节对账见上文；剩余产品 renderer 明确归后续 owner |
| `ap3-result` | 通过 | 144/144 定向、504/504 全量、主题/响应式/键盘可访问性规则与主要状态回归通过 |

## 6. 剩余项与非目标

- Installed Plugin 的 iframe/WebView 隔离、安全 Capability Bridge、CSP 和权限撤销恢复不是本次已实现能力，仍需后续平台 Goal。
- Goals、Artifacts、Execution/Evidence、Work、Project/Settings 产品页面不在 AP3 内重写，按 GW5/AR3/EX4/WK3/AP4 迁移。
- `src/web/render.ts`、`src/web/server.ts` 和 Workbench EN compatibility catalog 仍是迁移债务；已经在 Huge Class 迁移图中标明唯一 owner 和退出条件。
- 本次是行为保持型架构迁移，未改变数据库 schema、业务事实或对外 HTTP 语义，因此不需要数据 migration/rollback；回滚方式是恢复旧 import/asset ownership，现有数据不受影响。
