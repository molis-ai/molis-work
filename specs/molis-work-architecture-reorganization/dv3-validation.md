# DV3 验收：Plugin SDK、CLI 与 Sample

2026-09-05，accepted Contract revision 1。完成等级：本地开发者路径功能可用，不是产品整体完成或可发布认证。

## dv3 boundary audit

- Manifest JSON/版本/声明校验归 Contracts `platform/plugin-manifest.ts`；SDK `assertManifest` 转调并保留原错误类，CLI 不维护第二套规则。
- SDK 只依赖公开 Contracts；Plugin 作者只用 SDK 和 `context.services`。存储属于 Plugin Runtime，Artifact client 属于官方 Artifacts Plugin，UI client 属于 UI Host。SDK 不持有 Store 或 SQL。
- 签名与包内容校验归 Runtime，CLI 仅处理显式文件输入输出；公钥绑定校验和整个 payload 签名没有复制到 SDK/CLI。
- development fixture 属于 Local Host。根 CLI → Plugin CLI 的具名 runner → root Local Host capability → public `runPluginDevelopment` → Runtime/Artifacts/UI owners。原 Store/Coordinator 仍只在已有 root composition 装配，不新增另一处。
- `node scripts/check-package-boundaries.mjs`：48 包、324 源文件、69 依赖边、0 错误。`node scripts/workspace-packages.mjs`：48 个唯一包、0 错误。相关新依赖、workspace inventory、lockfile 的 workspace link 已对应。

## dv3 contract conformance

Manifest 与授予权限共同限定 storage/artifact/ui 操作。Host 固定项目、用户和签名绑定生产者；作者不能伪造这些字段或自动将内容分享到 Team。Artifact 生产/消费按 type/schema 和 id/version，不要求消费者依赖生产 Plugin。旧 client 在 crash、失败 start、uninstall 后失效，recover 不重新激活旧引用。

源码调试明确要求 `--allow-unsigned-development`，不冒充沙箱。签名 verify 校验收到的整个 bundle，不以此授权另一目录代码。普通非空目录不会被写入开发状态；开发命令不操作用户项目 catalog。

## dv3 caller inventory

- 官方 GitHub/Gmail polling Integration 继续消费 SDK 原公开 helper；现有 Plugin integration 回归保留。
- CLI create 输出和 examples/plugin-sample 只从公开 SDK 导入，SDK/Contracts 以本地 pnpm tarball 在仓库外临时目录离线安装；没有仓库 deep import。
- 根 CLI 新增 plugin 子命令，独立工具不构造应用数据库。`PluginCliHost`、`runPluginDevelopment` 是真实公共入口，CLI 测试经过同一 fixture，不靠测试私有装配运行 dev。
- 示例不在 production workspace。实际 `npm pack --dry-run --ignore-scripts --cache <新临时目录> --json` 文件清单只含原有三个 examples 文件，不含 plugin-sample；不是仅检查 package.json 声明。

## dv3 legacy responsibility diff

SDK 内嵌 Manifest 算法迁到 Contracts 后以转调兼容，不保留两份校验。tooling/plugin-cli 从 descriptor-only 变为真实命令实现。没有从其他 Module 吸收业务，也没有把原安装 Huge Class 宣称已拆完；其安装/分发职责属于后续 DV4。Runtime 既有官方字符串绑定身份没有被静默重签。

## dv3 targeted test or inspection

已执行：

```bash
node --import tsx --test tests/plugin-authoring.test.ts tests/plugin-package.test.ts tests/plugin-private-storage.test.ts tests/plugin-artifact-client.test.ts tests/plugin-host-executor.test.ts tests/plugin-runtime-integration.test.ts tests/artifacts-module.test.ts tests/plugin-sample.e2e.test.ts tests/import-boundary-template.test.ts
```

14 通过，0 失败/跳过。随后扩展同一 sample E2E，让仓库 examples/plugin-sample 文件也在独立目录经真实 CLI 运行；该测试再次单独通过。

- create/validate、缺失/损坏 Manifest、Host API 不兼容、缺权限、无授权、普通目录拒绝均实际调用命令。
- 外部安装 SDK 的源码通过主 CLI 运行两个独立进程：保存计数 1→2，返回各自 UI，保留全部 Artifact 历史版本，最终安装状态 uninstalled。拒绝缺权限后的第一次成功仍为版本 1。
- 不同生产者的兼容 Artifact 消费、其他用户个人内容拒绝、错误 schema、伪造 board/actor/producer/Team scope 被拒绝或由 Host 固定，检查了最终数据和无额外写入。
- 私有数据库真实关闭重开、签名隔离、删除、权限撤销；Runtime crash/recover 与失败 stop 后撤权、重试卸载、旧 client 不复活。
- 真实 identity/create/pack/sign/verify：篡改文件、换公钥、改外层 Manifest、伪造身份、路径跳转、symlink、覆盖已有输出均拒绝。临时生成测试密钥，没有读取用户密钥。
- 原 test-kit 九项边界测试已通过；新增模板假导入回归通过。没有额外依赖来隐藏 scanner 的模板误报。

受影响包的实际 TypeScript 构建、根 TypeScript、`git diff --check` 通过。先前首次测试错误地期待 Artifact 查询只返回最新一版；核实生产 owner 返回全部版本后，断言改为逐版验证保留历史，未改变生产语义以迎合测试。

## dv3 primary deliverable

[开发指南](../../docs/platform/PLUGIN-DEVELOPMENT.md) 给出实际创建、离线安装 SDK、源码调试、打包签名命令和公共 testing fixture。CLI/SDK/Runtime/Local Host/sample README 已同步。CLI 不是市场，未发布 npm 包，也未宣称签名等同官方审核。

## 后续边界

标准 pnpm run 依赖自动检查曾要求 purge 现有 node_modules；未授权清空、未修改用户全局配置。锁文件 workspace link 已更新，直接构建和临时目录 npm 离线安装可用；普通 npm cache 写入被权限拒绝后，打包清单检查改用新临时 cache 成功，没有执行 chown。干净完整安装、分发/供应链与已安装 reader 版本问题由依赖 DV3 的 DV4 继续，不能用本报告代替可发布证明。

trusted-source dev 不承诺跨进程托管、强制杀进程后的自动恢复或 OS sandbox。当前 UI 证据是实际 Host 注册/渲染/撤销，不是浏览器用户交互。整个重组仍需其余 Module/Coordinator/Huge Class 迁移、最终实际前后端 E2E、清理后的重复 E2E，以及初始架构要求逐项审计。
