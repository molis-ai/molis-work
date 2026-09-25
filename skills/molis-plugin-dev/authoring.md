# SDK、CLI、存储、测试

这一页给「作者 API 和怎么跑起来」。一等产品入口的 Host 文件清单在 [host.md](host.md)。命令细则在 `docs/platform/PLUGIN-DEVELOPMENT.md`。

## SDK

包 `@molis-ai/molis-work-plugin-sdk`（仓库内 0.0.0，用同一次构建的 tarball，不要假设 npm 上已有发行物）。

```ts
import { definePlugin, definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";
```

`definePlugin` 校验 Manifest 后冻结定义。`start(context)` 必须返回 `PluginContribution`：

- integration → `kind: "integration"` + `connector_driver` + `signal_adapter`
- app → `kind: "app"` + 兑现 Manifest 声明的 views/routes/mcp/behaviors；有命令再兑现 `commandAvailability` / `executeCommand`；有订阅再兑现 `onEvent`；有输入口再兑现 `onUpstreamReady` / `onUpstreamUnavailable`

`PluginStartContext`：`requireGrant(permission)`；`services` 仅在应用 Host 里有：

| services | 何时有 | 做什么 |
| --- | --- | --- |
| `storage` | 声明了私人存储 | get/set/delete；可选 `compareAndSet`。需要冲突检测时 Host 没有该方法就拒绝，不要用 get+set 假装原子 |
| `artifacts` | 一直在 | publish / 按 id+version read。Host 绑定项目、用户、生产者 |
| `ui` | 一直在 | register/unregister Manifest 声明过的 contribution |
| `events` | 声明了 publishes | `publish({ event_type_id, type_version, payload })`。没声明就没有这个 client |
| `inputs` / `outputs` | 声明了端口 | 输入读绑定和 `selectedGroup`。输出是 `publish`、`invalidate`、`retain`。`scope_key` 由 Host 创建 client 时附上，见 [elements.md](elements.md) |
| `actions` | 声明了 actions | 调用本插件已注册的公开动作；Host 绑定用户，停用后失效。HTTP 用 `bindPluginActionRoute` 薄转发，不另写业务实现 |
| `capabilities` | 声明了 consumes | `invoke` 已 grant 的 Capability |

动作处理器的 `ActionCallContext.actor_id` 是可信调用主体，MCP 授权按此客户端身份判断；可选 `actor_kind` 是审计分类。可信兼容适配器可提供 `audit_actor_id` 保留历史会话作者及幂等域，此字段不参与授权，不得从业务 JSON 覆盖。跨进程 Host 只根据固定客户端和可信会话元数据推导审计作者，不接受任意作者 ID。`actor_kind: null` 保留旧内部调用者未记录的分类，不授予用户决策权限。公共输入只声明业务数据，项目、权限及身份从调用上下文取得。Goals 的目录/创建/便笺可通过其 `goalsActions` 引用；模型入口创建默认记录 runtime 来源，旧内部适配器保留原来源与幂等键。

作者不碰 Store、SQL、数据库路径。缺权限、停用的旧上下文、未声明的类型/界面都会被 owner 拒绝。

`PluginDefinition` 还可带 `event_types`、`agent_prompts`、`agent_skills`。可选 `stop` / `health`。

## CLI（第三方 / 本地样例）

今天 `plugin create` 生成的是 **integration 样例**（私人计数 + Artifact + 一段 UI），不是 Native 侧栏插件。

在仓库根、先 `pnpm build`：

```bash
plugin_dev_dir="$(mktemp -d)"
node dist/cli/main.js plugin create "$plugin_dev_dir/sample" io.molis.work.example.notes local-developer local-development-binding
pnpm --dir packages/contracts pack --pack-destination "$plugin_dev_dir"
pnpm --dir packages/plugin-sdk pack --pack-destination "$plugin_dev_dir"
npm --prefix "$plugin_dev_dir/sample" install --offline --ignore-scripts --no-audit --no-fund \
  "$plugin_dev_dir/molis-ai-molis-work-contracts-0.0.0.tgz" \
  "$plugin_dev_dir/molis-ai-molis-work-plugin-sdk-0.0.0.tgz"
node dist/cli/main.js plugin validate "$plugin_dev_dir/sample/manifest.json"
node dist/cli/main.js plugin dev "$plugin_dev_dir/sample" "$plugin_dev_dir/state" \
  storage:private,artifact:write,artifact:read,ui:register --allow-unsigned-development
```

`dev`：真实安装、启动、poll 一次、渲染已注册 UI、卸载并撤 UI/授权。退出码 0 只表示这次健康检查和 poll 成功，**不是**浏览器交互已验收。状态目录必须是新目录、空目录或已有 `.molis-work-plugin-development.json` 的开发目录。不要用正式项目目录。

空 grant `""` 应被拒。没有 `--allow-unsigned-development` 不会执行插件。开发 JS 仍能碰进程和磁盘；Host grant 只限制提供给插件的 API。

也可：`molis-work-plugin validate|create|pack|identity|sign|verify`。

## 打包与签名

`plugin pack` 只含 package.json 的 `files` 以及 package.json/manifest.json；拒绝 `..` 和符号链接；不跑安装脚本、不收集依赖。JSON bundle 上限 64 MiB，不覆盖已有输出。

要签名：`identity` 拿 Ed25519 公钥当 binding；`sign` 显式私钥；`verify` 用调用者信任的公钥。签名只证明内容和发布者，不是官方审核。`local-development-binding` 没有密码学含义。

## 生命周期

状态：`installed` → `running` / `disabled` / `crashed` / `quarantined` / `uninstalled`。一个插件启动失败只影响自己。卸载不删已形成的 Artifact/Signal。崩溃可在上限内恢复。当前项目的插件市场支持 Runtime 插件手动升级：Manifest 用精确的 `upgrade_compatibility` 来源版本声明直接兼容或可迁移；可迁移版本还须实现只读 `validateUpgrade`。常规启动不写入新版本，升级保留 `install_id` 与既有 grant。独立进程沙箱和 Server entry 仍不是已上线承诺。详见[插件版本升级](../../docs/platform/PLUGIN-DEVELOPMENT.md#插件版本升级)。

## 测试

每个测试对应合同、状态转换或真实故障。必须打到生产代码或公共 CLI，不要测测试工具自己。

| 路径 | 测什么 |
| --- | --- |
| `tests/plugin-sample.e2e.test.ts` | CLI create、SDK tarball、两进程 poll、权限、目录边界 |
| `tests/plugin-package.test.ts` | 签名与篡改拒绝 |
| `tests/<plugin>-plugin.test.ts` | 该插件 HTTP/UI/MCP |
| `tests/plugin-declarative-mounting.test.ts` | 侧栏/岛/个人插件名单 |
| `tests/creative-tools-plugins.test.ts` | `PERSONAL_PLUGIN_IDS` |
| `tests/uninstall.test.ts` | `{home}` 下私人库名 |
| `tests/list-silent-refresh.test.ts` | 有列表时的 factory / `loadList` |
| `node scripts/workspace-packages.mjs` | 包名、依赖、contracts export、README/tsconfig/index |
| 本机浏览器 | 改了可见 UI 之后 |

构建后：

```bash
node --import tsx --test tests/plugin-sample.e2e.test.ts tests/plugin-package.test.ts
```
