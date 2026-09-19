# 本地 Plugin 开发

这条路径用于开发者运行自己信任的源码，完成第一次真实的插件结果；不是官方市场安装，也不是不可信代码沙箱。当前样例是 polling Integration Plugin。它每次运行产生一个个人 Artifact 版本、读回该版本、保存私人计数，并返回 UI HTML。

## 创建和运行

先构建仓库和 Plugin SDK、Contracts、Plugin Runtime、Plugin CLI、Local Host。根目录的 `pnpm build` 包含这些构建。当前工作区的 pnpm 依赖自动检查曾要求重建 node_modules，尚未执行该重建；本轮验证使用现有 TypeScript 构建产物，标准干净安装/发布链由 DV4 继续验收。

SDK 的 0.0.0 是本地开发版本，不假设 npm 已有发行物。以下命令在仓库根目录运行，把作者项目和安装数据放在新临时目录：

```bash
plugin_dev_dir="$(mktemp -d)"
node dist/cli/main.js plugin create "$plugin_dev_dir/sample" io.molis.work.example.notes local-developer local-development-binding
pnpm --dir packages/contracts pack --pack-destination "$plugin_dev_dir"
pnpm --dir packages/plugin-sdk pack --pack-destination "$plugin_dev_dir"
npm --prefix "$plugin_dev_dir/sample" install --offline --ignore-scripts --no-audit --no-fund "$plugin_dev_dir/molis-ai-molis-work-contracts-0.0.0.tgz" "$plugin_dev_dir/molis-ai-molis-work-plugin-sdk-0.0.0.tgz"
node dist/cli/main.js plugin validate "$plugin_dev_dir/sample/manifest.json"
node dist/cli/main.js plugin dev "$plugin_dev_dir/sample" "$plugin_dev_dir/state" storage:private,artifact:write,artifact:read,ui:register --allow-unsigned-development
```

`dev` 会真实安装、启动、检查连接、poll 一次、渲染已注册 UI，最后卸载运行实例并撤销 UI/授权上下文。输出 JSON 包含健康状态、poll 结果、各个 Artifact 版本、渲染 HTML 和最终安装记录；退出码 0 表示该次健康检查与 poll 成功。它不打开浏览器，也不把 HTML 渲染成功称为用户交互已验收。

再次运行同一条 dev 命令，新进程会从开发数据库恢复私人计数并生成下一版本；已产生的 Artifact 保留。空 grant 字符串 `""` 会触发缺权限拒绝。缺少显式源码执行选项不会执行插件。版本不兼容在加载入口前拒绝。开发代码可以访问进程和文件系统，Host grant 只限制提供给插件的 API，不能阻止任意 JS 自行执行其他操作。

状态目录只能是新目录、空目录或已有 `.molis-work-plugin-development.json` 标记的开发目录。普通非空目录不会被用作数据库；这条命令不选择或改动用户项目 catalog。同一状态目录用于串行调试，不是多进程运行服务；强制杀进程后的安装状态恢复、后台托管与发行物安装不是本命令承诺。不要把正式项目或 Team Server 目录作为开发状态目录。

## 作者 API 与公共测试入口

作者从 `@molis-ai/molis-work-plugin-sdk` 导入 `definePlugin` / `definePollingIntegrationPlugin` 及公开类型，在 `start(context)` 中使用 `context.services`：

- `storage`：字符串 get/set/delete，仅自身安装数据，须声明并授予 storage:private。
- `artifacts`：publish 个人内容、按 id + version read；由 Host 绑定项目、用户、生产者。通过 Artifact type/schema 互通，不要求指定哪个插件生产。
- `ui`：注册 Manifest 声明的自身 contribution，由 UI Host 检查挂载格式，停止后撤销。

这些是公开 Contract，不向作者开放 Store、SQL 或其他模块内部路径。缺权限、停用的旧上下文和未声明的类型/界面贡献都会被实际 owner 拒绝。本样例不请求网络、不自动 Team 分享；分享仍是用户明确选择的业务操作。

嵌入式测试使用 `@molis-ai/molis-work-app-local-host` 的公共 `runPluginDevelopment(input, options)`：输入是已授权的源码目录、项目/用户、grants；options 注入真实 Artifact owner、UiHost、Plugin Runtime repository 和私有存储工厂。它与应用命令使用同一安装/运行/卸载实现，返回 `PluginDevelopmentResult`，不要求导入仓库测试文件。数据库装配属于应用 Host，不属于 SDK 或 CLI。CLI 的 `PluginCliHost.runDevelopment` 是具名的注入接口，不是任意方法总线。

## 打包与签名

`molis-work plugin pack <source> <bundle.json>` 只包含 package.json 的显式 files 以及 package.json/manifest.json，拒绝目录跳转和符号链接；不执行安装脚本、不自动收集依赖。样例运行依赖同版本的公开 SDK 分发包，bundle 本身不是独立安装器。JSON bundle 上限 64 MiB，输出文件不覆盖已有文件。

对真正要签名的包，先用 `molis-work plugin identity <public.pem>` 取得 Ed25519 公钥绑定身份，作为 create 的 binding-signature；再 pack。`sign <bundle.json> <private.pem> <signed.json>` 必须显式指定私钥文件，身份须与 Manifest 一致。`verify <signed.json> <trusted-public.pem>` 使用调用者信任的公钥校验全部包内文件与 Manifest；没有签名、内容被改、发布者不符都会失败。也可用 Runtime 的 `PluginPackageSigner` 对接发布环境，避免把密钥暴露给应用。

签名只证明内容和发布者身份，不代表官方审核；验证 bundle 不授权执行另一份源码目录。示例中的 local-development-binding 不具备密码学签名含义。本轮测试只使用新生成的临时密钥，没有接触用户密钥或发布 registry。

## 可复现验证

构建后运行 `node --import tsx --test tests/plugin-sample.e2e.test.ts tests/plugin-package.test.ts`。前者从干净目录实际调用 CLI、安装本地 SDK tarball、运行两个独立进程并核对结果/历史版本/权限/目录边界；后者验证签名与篡改拒绝。其他 Host/Runtime 定向测试覆盖崩溃恢复、卸载失败撤权和不同签名数据隔离。整体前后端用户 E2E 仍在所有重组开发完成后单独执行。
