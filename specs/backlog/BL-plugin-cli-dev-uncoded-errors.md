# BL-plugin-cli-dev-uncoded-errors

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-plugin-cli-dev-uncoded-errors | `molis-work plugin dev` 被拒的原因不是 Manifest，错误码却写 `plugin.manifest_invalid`：`tooling/plugin-cli/src/cli.ts` 的 `catch` 把所有不带 `code` 的错误都记成它。2026-11-08 实测两处：状态目录是普通非空目录（`apps/local-host/src/local-plugin-development.ts` 抛的「Plugin 开发不能使用非空的普通目录或用户项目目录」）、漏写 `--allow-unsigned-development`（`cli.ts` 自己抛的普通 `Error`）。作者会以为自己的 Manifest 写错了。要做的：这两处（以及 `runLocalPluginDevelopment` 里其他普通 `Error`）用 `defineErrorCodes` 声明各自的码（宿主的归 `host` 或 `plugin`，按 `tooling/gates/error-owners.json`），`catch` 的兜底码只留给 `validate`；手册里「错误码误报」那半句随之删掉 | 第 14 批 FSS-72 走查的后续核对：独立工具跑 `dev` 的同类问题已改成 `plugin.host_required`，这两处在 Host 一侧或不在走查的路径上，没一起改 | 已知缺口 | 第 14 批只修了走查直接撞上的那一处；另两处的码要按主人表定归属，不在文档 PR 里扩 | 无 | 低 | C1／合同与 SDK（`tooling/plugin-cli` 归属「工具」，执行会话待分配） |
