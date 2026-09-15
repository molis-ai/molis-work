# 产品启动与桌面工程归拢

## 目标与当前证据
用户授权归拢根 desktop，并询问根 src 能否一并迁移。根 desktop 保留 Tauri 配置/图标/权限/资源/占位页，Rust bin 已指向 apps/desktop/adapters；根 src 六文件仅含产品启动器与 0.1.x SDK 兼容层，但构建、测试、installer 指纹仍依赖旧位置。
完成等级：源码归位，构建、公共入口、SDK 与桌面原生测试/打包路径验证；不升级真实 Home、不公开发布。

## 布局与契约
- desktop/src-tauri → apps/desktop/src-tauri；desktop/webview-placeholder → apps/desktop/webview-placeholder。Cargo bin 改用同包 adapters/tauri/src/main.rs。
- src/{cli,mcp,web} → apps/desktop/launchers/{cli,mcp,web}，它们是最终产品的启动装配，仍依赖根产品 manifest，不变成 CLI/MCP 协议包对 Host 的循环依赖。
- src/{index,sdk-store,sdk-types}.ts → apps/local-host/sdk/，独立编译 SDK 兼容发布面；内部生产逻辑继续使用 Host/Module API。
- 根 tsconfig 与新增 tsconfig.sdk.json 分别编译两组产品源，输出仍为原 dist 文件路径。bin、根 exports、已安装 launcher 和 SDK 名称保持不变。
- 更新 source-mode CLI 默认仓库根定位及 Web PTY 资源定位。打包 freshness 纳入新的源码目录与 SDK 编译配置；不得遗漏这些输入或扫描 target/resources/node_modules。
- 更新构建脚本、CI Cargo 路径、测试与活跃文档引用；迁移历史记录不批量改写。

## 修改边界
允许修改上述搬迁文件、根 scripts/tsconfigs、Desktop release 工具、installer fingerprint、边界扫描与相关测试、当前 README/架构/开发文档。已有 38 份未提交 README 保留并同步新链接；用户原有 desktop 图片删除不恢复，不混入自动提交。无新工作区包、业务逻辑或数据迁移。

## 验收与验证
1. 根 src/desktop 实际目录退出；新路径明确，旧发布入口仍存在。
2. 完整 pnpm build/typecheck 与 boundary 通过；SDK公开导出、CLI参数、MCP请求/会话及 Web/PTY 资源链通过针对性测试。
3. source CLI 与 built CLI 均将安装默认目录指向仓库/发布根；freshness 能发现 launcher 与 SDK 源变更，现有测试应对路径错误敏感。
4. Cargo manifest、版本与资源配置检查；cargo test；有环境条件时执行 Desktop 构建验证，不安装/覆盖用户应用。npm staging 验证 root exports/bin 和内部依赖可消费。
5. git diff/文档链接自检，不夹带业务更改。实际未运行或受阻项明确记录。

验证命令：pnpm build；pnpm typecheck；pnpm boundary:check；node --import tsx --test 的 scoped 公共入口、installer/runtime-payload 回归；cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml；Desktop release 版本与构建工具。

## 实施中确认的路径问题
- source-mode CLI 的 URL 基准是文件所在目录，迁移后回到仓库根需要四级；新增从无关 cwd 调用源码安装器的回归能检测该差异。
- Runtime payload 准备原先在资源父目录暂存。资源迁入 apps/desktop 后，Node fs.cp 会拒绝把 desktop workspace 依赖复制到其自身子目录；现将准备暂存区放在系统临时目录，完成后仍按原流程替换资源并在失败时保留上一份。纳入 Desktop tooling 修改与真实准备/打包验证。
- Cargo target 缓存含旧绝对路径，首次原生构建失败；已清理可再生 target 后重建，原生 12 项测试通过。真实安装未改动。

## 验收记录
- 通过：根 src、desktop 实际目录已退出；三个启动器与 SDK 六个源文件归位，Cargo/Tauri 配置、权限、图标、占位页和资源归 Desktop。根 dist/bin/exports 不变，Cargo.lock 依赖内容未变。
- 通过：完整 pnpm build（38 workspace + 两组产品入口）；CLI 路径修正后重新编译 launchers，并对 SDK 执行 noEmit 检查。CI 追加两组产品源类型检查。
- 通过：入口/安装/MCP/PTY/Home/runtime-payload 共 95 项场景，初轮 94 通过，source CLI 的路径差一层失败后修正并单独复验通过。源码与构建版从无关 cwd 使用同一安装源，保持已安装 release 正确、幂等。
- 通过：新结构的 launcher/SDK/SDK tsconfig/Module 源码变化均触发 stale-build 拒绝，安装记录、旧 launcher 及其可运行性不受影响；生成输出不作为源码。
- 通过：额外 Web catalog/PTY 资源 HTTP 回归、根 SDK 出口回归；38 包边界扫描零错误，旧存储/查询边界 2 项与规则测试 9 项通过。
- 通过：清理旧绝对路径缓存后 Cargo 原生 12 项测试通过；所有版本源一致；从新目录构建 debug Molis Work.app 并通过 codesign --verify --deep --strict。未运行新 release DMG/公证或真实 App 启动。
- 通过：Desktop Runtime 资源通过真实 prepare 工具在新目录生成；资源内自带 Node 成功加载 root SDK，在内存数据库初始化并查询 Board。npm 工具成功生成 0.1.14 tarball；未重新做全新 npm consumer 安装。
- 通过：改动文档链接与 git diff --check。没有安装/覆盖用户 Home、现用 App 或 4173 服务。

本轮日志：/private/tmp/molis-work-entry-{build,tests,source-cli,web-assets,sdk,cargo-tests,resources,app-build,npm,root-boundaries,boundary-tests}.log。源码 CLI 的失败→修正复验和 Runtime 暂存错误→工具成功为本轮路径修复证据。提交/推送未执行，前一轮 38 份 README 修改仍在工作区。
