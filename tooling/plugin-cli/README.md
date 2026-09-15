# Plugin 开发与打包命令

给 Plugin 作者提供 validate、create、pack、identity、sign 和 verify 命令，并通过 Host 接入本地开发验证。

包名：`@molis-ai/molis-work-plugin-cli`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

runPluginCli 分发命令；validate 使用 Contracts 的 Manifest parser，pack 生成显式文件列表的 JSON bundle，签名和验证使用 Plugin Runtime 的公开包验证接口。dev 通过注入的 PluginCliHost 使用真实 Local Host。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/cli.ts](src/cli.ts) | 命令与输出 |
| [src/create.ts](src/create.ts) | 示例项目生成 |
| [src/package-files.ts](src/package-files.ts) | 文件打包 |
| [src/package-signing.ts](src/package-signing.ts) | 签名与验证 |

可对照现有调用方 [apps/desktop/launchers/cli/main.ts](../../apps/desktop/launchers/cli/main.ts) 阅读装配方式。

## 接入与边界

构建后再运行 bin。create 要求父目录已存在且目标不存在；pack 不覆盖输出，拒绝 symlink、越界路径、生命周期脚本及超过 64 MiB 的包。verify 依赖调用方提供的受信 Ed25519 公钥，签名不代表官方审核或 marketplace 上架。

工作区依赖：`@molis-ai/molis-work-plugin-runtime`、`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-cli typecheck
pnpm --filter @molis-ai/molis-work-plugin-cli build
```

已有行为示例与回归：[plugin-package.test.ts](../../tests/plugin-package.test.ts)、[plugin-authoring.test.ts](../../tests/plugin-authoring.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/plugin-package.test.ts tests/plugin-authoring.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

使用仓库自带的 Manifest 做一次只读校验：

```bash
node tooling/plugin-cli/dist/main.js validate examples/plugin-sample/manifest.json
```

成功时退出码为 0，并返回通过校验的 Plugin 身份/版本；它不会启动该 Plugin。开发运行、打包与签名的完整步骤见下方指南。

## 进一步阅读

- [职责与接入说明](../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/tooling`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-dv3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
