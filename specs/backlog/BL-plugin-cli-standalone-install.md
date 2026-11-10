# BL-plugin-cli-standalone-install

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-plugin-cli-standalone-install | 独立的插件命令 `molis-work-plugin`（`tooling/plugin-cli`）装不到仓库外面。现象：照 `docs/platform/PLUGIN-DEVELOPMENT.md`「创建和运行」只 `pnpm pack` contracts 和 SDK，再加 plugin-cli 的 tgz，`npm install --offline` 报 `ENOTCACHED … @molis-ai/molis-work-plugin-runtime`。原因：plugin-cli 的 `dependencies` 里有私有的 `@molis-ai/molis-work-plugin-runtime`（签名与验证用它的公开包验证接口），它不在外部作者能装的两个包里（AGENTS.md 硬约束），只有再 pack 它才装得上。所以今天外部作者的 `validate`、`dev` 都只能用 Molis Work 本体的 `molis-work plugin …`（仓库里 `node dist/cli/main.js`，或装过的 Home 里 `~/.molis-work/bin/molis-work`），手册（`skills/molis-plugin-dev/text-and-appearance.md` 第 4 步、`PLUGIN-DEVELOPMENT.md`）照这样写。要定的：`molis-work-plugin` 要不要成为作者可以单独装的工具（那就把 plugin-runtime 用到的部分移进 SDK 或随 CLI 打包，并补一条像 `tests/plugin-sample.e2e.test.ts` 的离线安装用例），还是明说它只在仓库里用、作者一律用 `molis-work plugin` | 第 14 批 FSS-72 外部作者走查（2026-11-08）：照手册装 tarball，plugin-cli 装不上 | 已知缺口 | 打包的旧问题，第 14 批只改手册如实写 | 是否开放独立 CLI 要用户拍板 | 中 | C1／合同与 SDK（`tooling/plugin-cli` 归属「工具」，执行会话待分配） |
