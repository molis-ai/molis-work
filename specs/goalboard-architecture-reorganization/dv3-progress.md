# DV3 当前交付与剩余项

2026-09-05；DV3 已于 07:42 UTC 经正式 Review 完成。完整证据见 [DV3 验收](dv3-validation.md)，本文件保留阶段记录，不代表整个重组完成。

## 已经真实工作

1. Contract 拥有 Manifest parser；SDK 转调并保留错误类，CLI validate 使用同一规则。外部 JSON、Host API 版本、权限和 Artifact type/schema 声明均有定向验证。
2. CLI create 生成只导入公开 SDK 的可运行源码；非法输入在创建前拒绝，现有目录不覆盖。仓库样例位于 examples/plugin-sample，未加入 production workspace。
3. Runtime 为每次 start/recover 建立可撤销权限上下文；失败、crash、uninstall 后旧引用失效。失败 stop 后状态是 crashed，可重试卸载，不保留假 running。
4. Plugin Runtime 私有 SQLite 存储按签名绑定 install ID 分区；真实重开数据库后恢复，不同签名隔离，无 grant/旧引用不能读写。作者无 namespace、SQL 或路径参数。
5. 官方 Artifact Plugin 提供绑定用户/项目/生产者的 publish/read。只生产声明类型，按 type/schema 消费、不限制生产者；精确 id/version、个人权限、不自动 Team 分享。旧版本与已交换内容在生产者卸载后保留。
6. UI Host 注册 client 只允许声明的自身 contribution；Local Host 把三个 API 接为 context.services。停止和启动失败清理 UI；权限撤销后旧 client 不复活。
7. 干净临时目录实际 CLI create → pnpm pack SDK/Contracts → npm offline install 两个 tarball → 从外部目录 import Plugin → 安装/拒绝缺权限/授权/运行 → 私有计数与个人 Artifact/UI → crash/recover/uninstall 成功。未使用仓库源码路径作为样例依赖。

## 已运行的验证

- Contracts、SDK、CLI、UI Host、Artifacts Plugin、Plugin Runtime、Local Host、test-kit 的受影响构建：通过；后段使用 `node node_modules/typescript/bin/tsc -p <package>/tsconfig.json`。
- `node --import tsx --test tests/plugin-authoring.test.ts tests/plugin-private-storage.test.ts tests/plugin-artifact-client.test.ts tests/plugin-host-executor.test.ts tests/plugin-runtime-integration.test.ts tests/artifacts-module.test.ts tests/plugin-sample.e2e.test.ts`：12 通过，0 失败/跳过。
- 现有 test-kit boundaries suite：9 通过。新增真实模板误报回归：1 通过。没有为模板假导入声明依赖或关闭边界规则。
- 直接边界检查：48 packages、317 source files、67 dependency edges、0 errors。根 TypeScript 和 git diff --check 通过。
- 这些不是整体前后端用户 E2E；样例 UI 目前验证真实注册/挂载 HTML，未声称实际浏览器交互与生产安装已验收。

## 最新收口

- CLI dev 已通过应用 Host 完整运行两个独立进程，恢复私人计数并保留旧 Artifact 版本；public fixture 与应用命令共用。打包、Ed25519 签名、指定可信公钥验证及篡改拒绝已通过真实命令。
- CLI create 的输出和仓库 examples/plugin-sample 都在最终开发命令中实际执行通过。sample package 是本地 0.0.0 SDK 消费者，不代表已发布 npm 或审核过的安装生态；产品 pack 文件清单确认排除 sample。
- Runtime 安装记录持久化已接开发流程，普通 dev 结束卸载运行实例并保留个人数据。可选非保留卸载的数据删除由 Host 调用 Runtime owner，底层删除行为已有测试，dev 本身不提供清除用户数据命令。
- 标准 pnpm run 的 dependency auto-check 要求重建当前 node_modules，非交互 purge 被拒绝。未删依赖目录；锁文件更新、pnpm pack、外部目录 offline npm install 成功，现有编译器/测试可继续。开发环境与 DV4 分发验证需收口，不改用户全局设置。
- 14 项定向回归通过；仓库样例的新增应用 CLI 路径单独再次通过。48 包、324 源文件、69 边，边界错误 0，根类型与 diff 检查通过。后续以 dv3-validation.md 和 Molis Work Review 为准。

更大的未完范围仍见总 spec 与 reorg-handoff.md：其余代码职责迁移、Huge Class/Cutover、实际前后端用户 E2E、清理后重复 E2E和初始架构要求逐项复核。
