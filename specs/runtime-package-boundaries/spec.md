# Runtime 安装包文件边界修复

## 目标与完成等级

服务于已授权的本机升级和 GitHub v0.2.0 发布：安装包只携带运行所需内容，重复构建不会把桌面缓存和旧包递归带入新包。完成等级：本机安装链路可用，并完成当前发布需要的构建、回归与安装验证。

## 真实问题与根因

2026-09-11，本机重新安装时首轮 App 构建完成，第二轮 v0.2.0 Runtime 打包耗时异常。实际 `resources/molis-work-runtime` 达到 30GB、桌面 `target` 达到 36GB。完整测试也在 `tests/e2e.test.ts` 的真实安装步骤耗时异常；已主动停止该测试，不能计作通过。

`home-release.ts` 对运行依赖目录执行递归复制，仅排除顶层 node_modules。`home-source.ts` 对同一依赖目录的 `.` 计算内容摘要。`@molis-ai/molis-work-app-desktop` 来自 workspace，目录同时含 `src-tauri/target` 和 `resources/molis-work-runtime`，因此旧构建、旧资源也被扫描并再次打包。该包已有明确 `files: ["dist", "README.md"]`。现有 npm 打包的 `copyPackageFiles` 已按明确 files 列表复制本地包，但 Home/App 路径没有遵守相同边界。

## 行为合同

1. Molis Work workspace 依赖使用自身声明的发布文件范围，保留 package.json、必要文档、dist 和已声明的运行资产（如规划 methods）。不打包源码、桌面 target、旧 resources 或包管理器链接。
2. Home 安装和 App Runtime payload 共用这一范围，内容摘要与实际复制范围一致。修改已分发内容会触发同版本刷新；修改未分发的构建缓存不会触发刷新或继续递归扫描。
3. 非 workspace/第三方依赖保留已有可运行边界，尤其 better-sqlite3、node-pty 的原生文件不能遗漏。不要把所有包假设为只有 dist，也不新建完整 npm packlist/glob 引擎或添加依赖。
4. 仍保留已分发内容的路径与链接边界检查、运行依赖完整性、原子安装和失败恢复。缺少明确声明的必要资产必须失败；不能把缺失当作成功安装。
5. 沿用现有 npm 文件范围能力，若抽取共享小助手，只做当前三个消费者实际需要的收敛，不另建打包架构。

## 场景、输入输出与依赖

输入：已构建的当前仓库或已打包安装源、运行依赖元数据、已有 desktop target/resources、指定 Node。
输出：不包含旧构建的自包含 Home release/App payload，当前 CLI/MCP/Web 与原生依赖仍能实际运行。
用户项目、Catalog、Session、Runtime 配置和备份不属于打包源或修改对象。

## 修改范围

允许：`apps/local-host/src/installer/{home-contract,home-dependencies,home-release,home-source,npm-package,release-assets,fingerprint,runtime-payload}.ts`，有必要时在同目录新增一个小型发布文件助手；`tests/install.test.ts`、`tests/npm-package.test.ts`、现有 Runtime payload 测试中直接相关场景。

不改：Goal 业务、MCP 协议、UI、数据库迁移、第三方依赖版本、锁文件（已完成的本版版本号除外）、用户文件、构建缓存以外的删除。既有窄屏修改、六处 v0.2.0 版本、README/Release 说明和无关截图删除保持。

## 验收与验证

- 用真实公开安装/payload API 和小型真实依赖夹具验证：声明的 dist/运行资产可用，嵌套旧 payload/target 哨兵没有进入安装产物。
- 验证仅修改未分发缓存时同版本安装为 unchanged；实际已分发代码/资产修改时刷新成功，安装后读取到新内容。期望独立于实现，不仅比较内部函数返回值。
- 现有 transitive dependency、原生模块、外部链接拒绝、失败回滚和 npm staging 回归仍通过。
- 构建 Local Host，再运行对应 installer/npm/payload 定向测试；Codex 随后完整构建并运行整套现有测试，完成本机安装与真实旧项目检查。
- 完成后审阅 scoped diff，说明文件范围、第三方依赖策略与真实命令结果；不以文件数或固定体积阈值代替可运行验证。

## 执行分工

继续使用 Grok CLI / Grok 4.6 / xhigh 作为唯一源码与仓库测试 writer，不使用子 Agent 或 ForkLight。Codex 负责合同、只读复核、临时项目升级探针、生成物清理、本机安装和 GitHub 发布。修复只解决本轮已经发生的安装包膨胀；没有新产品范围。
