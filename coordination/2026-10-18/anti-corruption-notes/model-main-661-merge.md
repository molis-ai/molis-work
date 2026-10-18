# M 合并固定 main 的候选交接

2026-10-18，唯一 M writer 完成。工作树：`/Users/yijunwang/code/molis-anti-corruption-20261017/wt-model-selection`；分支 `feature/w5-01-runtime-model-ports`。开始时 HEAD 为 `9892c6b9d2a480b5a15278c43ecb4e461a89d690` 且工作树干净。执行 merge、未 rebase，合入固定 `5f03d1e45751fc734b9d0440bc20b09d51a1a56a`，保留原历史。

本地 merge 候选：`236f3a57d`（完整 hash 由交接消息补充）。无推送、PR、标签；未修改 S/A/Todo。没有构建、Chrome、测试或生成门禁快照。仍待 root 构建、生成、验证，不能把旧证据视为合并后通过。

## 16 处冲突裁决

| 文件 | 裁决 |
|---|---|
| apps/local-host/src/home-side.ts | 保留 M 的 PluginFilesDeclaration import，与已有文件服务声明匹配 |
| apps/local-host/src/images-service-host.ts | 保留删除；不恢复 Host 专属实现 |
| apps/local-host/src/model-configuration.ts | 保留 M 的通用配置与 host.model_configuration_invalid；已有 selectedConnection.enabled/credential/disconnected 检查，去掉主线旧 Jelly HostCompleteText import |
| docs/platform/PLUGIN-DEVELOPMENT.md | 保留 M Runtime 模型/生图、项目清理与 inline bytes 章节；主线连接使用位置说明也保留 |
| docs/system/SECURITY-INVARIANTS.md | 保留 M S-38 材料服务拒绝合同；自动合并的 S-18 后台/模型/文件与主线 S-36/37 均保留 |
| package.json | 保留 M test:security 超集，主线条目全在；未改命令策略或门禁 |
| plugins/native/images/README.md | 保留 Runtime 生命周期与任务所有权说明；不恢复旧进程锁描述或重复“九项动作”段，现动作说明和 connection.usages、enabled、v2均保留 |
| plugins/native/images/src/actions.ts | 保留 ActionExecutionContext 与 caller-aware async save/delete；connectionUsages 已在共同代码，connections.list v2、jobs.start v2 均保留 |
| specs/assistant-service-connections/coverage.md | 纳入主线 ASC-40/41 历史验证段，保留其原切点、旧构建字节数与未宣称整功能完成的限定 |
| specs/assistant-service-connections/spec.md | 纳入主线 allowDisabled 与忙碌表单刷新合同/验收；原 M 其他内容保留 |
| tests/ci-product-subset.txt | 保留 M 的 files/background三项与主线其他项，检查所有路径存在 |
| tests/fixtures/goal-browser.ts | 保留主线显式 allowDisabled，默认仍等待 enabled，不改变真实点击/遮挡检查 |
| tests/images-mcp.test.ts | 保留 M jobs.start v2/旧v1拒绝，以及主线 connection.usages 和 connections.list v2拒绝旧合同 |
| tooling/gates/api/contracts/platform/plugin.txt | **仅以固定 main 原文件占位**；必须由 root 重生成，当前未反映 M 全部 API |
| tooling/gates/baseline.json | **仅以固定 main 原文件占位**；必须由 root 实测重生成，无手工拼数 |
| tooling/gates/page-assets.json | **仅以固定 main 原文件占位**；必须由 root 构建实测并处理已授权 rekey，无手工拼数 |

## 自动合并语义校核

M 已包含 #661 的大量原分支实现，因此虽然与 squash 后 main 发生冲突，最终 `apps/local-host/src`、`packages/contracts/src` 相对原 M 没有源码变化；index/project-host/web-catalog 自动合并后亦与 M 相同。Images 迁移后 `plugin-image-connections.ts` 已包含 `selected.enabled`、disconnected、credential 与 origin 检查；找不到选中连接但仍有 binding 时拒绝匿名本机回退，revision包括 enabled。连接视图含 enabled，停用时 state 为 disconnected。`plugin-image-generation-service.ts` bind 用 owner `state(selected) === connected`，生成反复校核原 revision。无需把旧 ImagesHostService 的检查再复制一份。

主线新的实际产品源码增量是 workbench refresh-decisions 的忙碌表单守卫/等待后再检查；对应真实场景测试与 allowDisabled 的显式负向调用一起进入。#716 的 run-tests pool/CI提前退出、#717产品运营文档按主线直接合入，未自行编辑。通用模型、材料、灵光、Cognia、Jelly、后台服务、图片 Runtime 合同未被退回旧接线。

`tooling/gates/actions/actions.tsv`、`host-actions.tsv` 和 SDK API 等自动合并后与原 M 相同；仍应随 root 的整体构建按最终合同生成核验，不能把“无文本差异”当作合同验证。

## 已做的有限检查

- 所有冲突标记移除，Git 无 unmerged entries。
- package.json 可解析；security 脚本的显式测试路径、ci-product-subset 非注释条目都存在。
- TypeScript parser 检查 home-side、model-configuration、Images actions、goal-browser、images-mcp、refresh-decisions 六文件，无 parse diagnostics。仅语法，不是类型检查。
- `git diff --cached --check` 通过。
- 旧验证段仅保留历史切点，没有新增“合并通过”的说法。

## Root 待办

1. 整体 build，再生成 API/action 快照；尤其当前 plugin API 文件临时少了 M 的新 API，是明确占位，不应直接作为最终产物推送。
2. 按固定/当前 main 的真实比较口径重新测量 health baseline、workspace assets。资源脚本与测试中的许可格式/额度本轮完全未改，旧 M rekey 仍需 root 正式处理。
3. 运行 M 相关 Runtime/model/images/Jelly/materials/后台/安全定向测试，以及主线刷新和显式禁用点击相关验证；全量、浏览器批次由 root 排时段。
4. 此候选包含三个生成占位文件，应先完成生成再作为最终通过版本合到 S/A；若先传播候选，要同步标记这三个文件仍待生成，不能误用为真实预算。
