# AP4 Desktop / Tauri Shell 迁移验收记录

日期：2026-09-02  
Goal：`goal-reorg-ap4`  
完成等级：AP4 行为保持型迁移达到“内部完整”；安装与发布级验证由 DV4 继续

## 1. 结论

AP4 已把 Desktop 产品外壳、Runtime 启动配方、面板生命周期、Capsule presentation 和 Tauri native adapter 迁入 `apps/desktop`，并保持当前 Web/Desktop 行为和数据不变。

这次没有把 Project、Session、Goal 或 Feed 事实搬进 Desktop，也没有实现旧版原本不存在的系统通知或 Desktop Keychain。现有通知按钮继续明确显示为“暂不可用”；发布签名、公证、SBOM 和干净安装矩阵仍归 DV4。

## ap4-boundary

### 公开边界与依赖方向

- `apps/desktop/src/index.ts` 是公开入口，暴露 shell、launch、advance prompt、panel 和 Capsule shell 能力。
- `DesktopPanelService` 拥有确认、路径、状态、alias 和事件规则，只依赖 Repository/Context ports；`apps/desktop` 不导入 `better-sqlite3`、Projects implementation 或 Store。
- `src/projects/desktop-panel-adapter.ts` 只实现迁移期 SQLite Repository；Project Catalog 注入 Project/context port，不再保存 Panel SQL 或规则。
- Desktop advance prompt 调用 Feed Native Plugin 的公开脱敏 API；旧 `src/feed/types.ts` 只 re-export，不保留第二套脱敏逻辑。
- `apps/desktop/adapters/tauri/` 是 native adapter；`desktop/src-tauri/` 只保存 Cargo/Tauri 打包配置和资源。
- `node scripts/check-package-boundaries.mjs`：48 packages、149 source files、241 imports、56 dependency edges、15 个有 owner 的旧兼容条目、11 个 legacy huge files、0 errors。
- `node scripts/workspace-packages.mjs`：48 package names、30 Contract subpaths、0 errors。

### 当前能力与未来 adapter

- 真实更新能力是内置 Molis Work Runtime 的 semver 升级、安装和 owned service 修复，不等同于尚未实现的 App 自动更新器。
- Tauri 使用显式 permission allowlist；PTY 与 Capsule commands 只有声明过的能力可以调用。
- 菜单栏状态、Capsule 和窗口恢复是现有 native surface。
- 系统通知与 Desktop Keychain 在迁移前不存在，AP4 没有注册假 adapter；将来实现时放在 Desktop Tauri adapter，通过公开 port 被正式 owner 调用。

## ap4-legacy-exit

### 旧职责退出与 Huge Class 拆分

| 旧位置 | AP4 前 | AP4 后 | 结果 |
| --- | ---: | ---: | --- |
| `desktop/src-tauri/src/main.rs` | 1,473 行 | 已删除 | 拆为 `main.rs` 812、`pty.rs` 327、`web_service.rs` 327、`runtime_env.rs` 36，并迁到 `apps/desktop/adapters/tauri/src/` |
| `src/web/capsule.ts` | 1,044 行 | 496 行 | CSS、client script 与 HTML shell 迁入 `apps/desktop/src/capsule-shell.ts`；旧文件只保留 read model 和兼容注入 |
| `src/projects/catalog.ts` | 2,392 行 | 2,104 行 | Panel schema/SQL 进入 SQLite adapter，Panel 规则进入 Desktop App；旧方法只转发 |
| `src/desktop/launch.ts` | 旧实现 | 薄转发 | 新 caller 使用 Desktop public entrypoint |
| `src/desktop/advance-prompt.ts` | 旧实现 | 薄转发 | 新 caller 使用 Desktop public entrypoint |
| `src/web/desktop-shell.ts` | 旧实现 | 薄转发 | 新 caller使用 Desktop public entrypoint |

生产调用方已经使用 `catalog.desktopPanels`，不再调用 Catalog 的旧 Panel 方法；旧方法仅保留公开兼容和 characterization tests。`src/web/capsule.ts` 已从 huge-file compatibility allowlist 移除。

没有把拆出的 1,473 行原样搬成另一个单文件：Tauri 按窗口/Capsule composition、PTY、本地 Web service、Runtime 环境四块拆分，每块有独立责任和测试面。

## ap4-result

### 用户可见行为

- Desktop 仍能启动和恢复本地 Web，关闭主窗口时保持菜单栏运行，并在真正退出时清理 owned service/PTY。
- Runtime 启动命令、环境变量、用户确认、面板顺序、Session alias、退出/重开/关闭保持兼容。
- Capsule 的状态、项目切换、定位、主题、中英文和断线恢复保持兼容。
- 内置 Runtime 升级和服务修复、Tauri permissions、Onboarding 与现有 Desktop 页面保持兼容。
- 系统通知仍是明确禁用的占位；本次不把未来能力伪装成完成。

### 验证命令与结果

| 验证 | 结果 |
| --- | --- |
| Desktop package + 根 TypeScript | 通过 |
| `cargo fmt --manifest-path desktop/src-tauri/Cargo.toml -- --check` | 通过 |
| `cargo test --manifest-path desktop/src-tauri/Cargo.toml` | 12/12 通过 |
| Project/Capsule/Desktop/Web 定向测试 | 123/123 通过 |
| `node scripts/workspace-packages.mjs` | 通过；48 packages / 30 Contract subpaths / 0 errors |
| `node scripts/check-package-boundaries.mjs` | 通过；0 errors |
| `CI=true pnpm test` | 504/504 通过，0 fail / 0 skipped |
| `git diff --check` | 通过 |

定向测试覆盖 Project Catalog、Panel lifecycle、Session migration、Capsule、Desktop launch/prompt/shell、Tauri 配置、PTY、Onboarding、i18n、Web 启动/恢复和内置 Runtime 升级。真实本机端口测试在允许 loopback 的环境中运行；沙箱内的 `EPERM` 不作为产品失败掩盖。

## 5. 验收标准对照

| Criterion | 状态 | 证据 |
| --- | --- | --- |
| `ap4-boundary` | 通过 | Desktop public entrypoint、port-based Panel service、Tauri adapter 就近放置；boundary/workspace checks 通过 |
| `ap4-legacy-exit` | 通过（按 AP4 职责） | Catalog Panel 规则、Capsule presentation、Desktop helpers 和 Tauri mixed main 已退出旧 owner；兼容 facade 只转发 |
| `ap4-result` | 通过 | 123/123 定向、12/12 Rust、504/504 全量通过；更新/权限/禁用通知占位、Onboarding、Capsule、i18n 与恢复均由现有真实路径覆盖 |

## 6. 剩余项与非目标

- DV4 负责最终 DMG、签名、公证、SBOM、供应链 provenance、干净安装/升级/卸载和发布文档。
- WK2 负责把跨 App 的 Runtime stream/recovery 抽成 Runtime Host；WK3 负责 Work/Session 产品 UI。AP4 只迁 Desktop adapter 和现有产品壳。
- Project Catalog 的旧 Panel 方法、旧 Desktop/Web import facade 在最终 Cutover 删除；它们不得再增加逻辑。
- 本次没有更改数据库 schema、外部 HTTP 路径或业务事实。回滚只需恢复旧入口所有权，用户数据不需要反向迁移。
