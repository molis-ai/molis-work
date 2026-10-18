# 队列刷新到 main 的只读诊断

2026-10-18；只读快照基准 origin/main `5f03d1e45751fc734b9d0440bc20b09d51a1a56a`。本报告没有修改任何分支、工作树或索引，没有构建、跑测试或推送。曾执行 fetch 和 git merge-tree（只写 Git 对象）核对真实合并结果。报告完成时主 Session 已开始 Todo 合并；以下冲突数是合并开始前的快照。

## 先处理 Todo 的三个资源文件

协调器已在 PR #684 的评论确认 #661 合入，应 merge main，不 rebase：
https://github.com/molis-ai/molis-work/pull/684#issuecomment-6247763111

1. `scripts/gates/page-assets.mjs`：Todo 当前授权是 `[1110187,1110215]`，只覆盖用户已同意的 +28 字节；main 中仍留着更早、已消费的 receipts3d4 `[1109913,1110802]`。不要把任何一个旧键直接当成新基线。main 实测快照 workbench.js 为 1110056。合并后构建若仍是主线加 28 字节，唯一候选新键为 `[1110056,1110084]`；必须先测量再决定，不能拿预测数字写预算。若最终不增长，应删除本次 allowance，不延续授权槽。
2. `tests/page-assets-budget.test.ts`：保留双方关于历史键失效的覆盖；至少旧 receipts 的 1109913/1110802 与旧 Todo 的 1110187/1110215 都应被拒绝。新键仅在实测、仍属于原批准增量时允许。历史拒绝测试与当前唯一 allowance 是两类行为，不能 ours/theirs 整文件选择。
3. `tooling/gates/page-assets.json`：从合并后的真实 build 重新测量。已知差异：main coding.js 374437，Todo 374470；main todo.js 62081，Todo 62036；workbench 冲突 main 1110056 / Todo 1110215。不是逐项取大或取小，也不能先抄旧分支再让脚本“确认”。新增主线代码有可能改变最终结果，按实测与已授权增量裁决。

`tooling/gates/baseline.json` 同样重新测量：web-catalog 巨大单元 main 316 / Todo 315；旧 connector-settings 227 行巨大单元已由 main 删除，不能合并回来。脚本与测试的资源授权变更需保持用户已有 +28 的边界，不扩成一般放宽门禁。

## 分支、PR 与依赖事实

| 队列 | 核对的 HEAD | 应合入的基线 | 预演冲突 |
|---|---|---|---|
| Todo / #684 | 3272c36df | origin/main 5f03d1e45 | baseline.json、page-assets.json 两个 |
| Stream / #703 | 299ce12e8 | 更新后的 Todo | 对当前 Todo 仅 SECURITY-INVARIANTS.md S-18；对 main 直接合有八个 |
| Dataset | 93a39bb33 | origin/main | 仅 baseline.json |
| M 模型集成 | 9892c6b9d | origin/main | 16 个 |
| S Shelf | a939…（记录时） | 更新后的 M | 当前直接对 main 为 17 个；不要单独解一遍 |
| A Alchemist | f26f8216e | 更新后的 M | 当前直接对 main 为 17 个；不要单独解一遍 |

本地 main `ba64f24a3` 比远端落后 111 个提交且无分叉。远端 main 相对 Dataset 的 aceffff86 新增 #717 文档、#661 连接器功能及 #716 全量用例提前失败退出。PR API 的 baseRefOid 是旧测试合并引用，不能拿来判断当前分支依赖；已用 ls-remote 核对 Todo 与 Stream 远端 HEAD。

Todo #684 在旧 HEAD 的检查成功，不证明刷新后成功。Stream #703 的 base 分支是 feature/w5-01-todo-runtime，但当前 Todo 3272 并非 Stream 299 的祖先，两者公共点 8738385e3。先完成 Todo，再把更新后的 Todo merge 进 Stream。M 已含 Stream 的实现至 7a4c2c04a（299 后续为 spec 文档），但不含 Todo 3272 全部更新。

## Todo / Stream 的验证重点

Todo 的自动合并经过 Host index/project-host/web-catalog，必须保留 main 的 closeConnectorResources 等待、this.closing 防护、新 connectorSettingsView 和 connections handler。冲突只有 JSON 不代表语义没有交集。

串行完成整体 build 后，先跑 page-assets-budget、Todo 相关动作/组织/插件、home-plugin-platform、home-plugin-private-store、home-plugin-model-lifecycle、project-deletion-owners、web-route-table、security-invariants-home-route-project；再按包 README 跑完整要求，含 Todo 的 e2e、draft recovery、contextual、context onboarding、from inbox、placement、assistant 与 action-error-model/edges。浏览器批次由主 Session 排时段。资源验证用 workspace build 后的 page-assets check；health 以 `--base origin/main` 对照；推送前 fetch + secrets:check。协调器负责是否再跑全量的裁决，不把旧 HEAD 全绿当新 HEAD 的证据。

Stream 合入更新后的 Todo 时，S-18 采用两者语义并集：当前 Todo 的安全文字加 Stream 的 progress authority 条款和对应测试。不要整行选择 ours/theirs。若跳过依赖而直接 merge main，将额外处理 goals-page-renderer、renderer、package.json、资源脚本/测试/两个快照等八个冲突，并重复解决同一基线问题，收益很小。

## Dataset 刷新

Dataset 的 42 文件改动与 #661 在 Host index/project-host/web-catalog、发布清单、spec、动作快照、baseline/assets 相交。预演只有 baseline 冲突：web-catalog main 316 / Dataset 309，且同样要去掉旧 connector-settings 巨大单元。Dataset 本体无需先人为重构；完成合并后定向验证实际路由、导入、promote、MCP、删除所有者及浏览器核心路径，确认自动合并没有恢复已删除 native host 装配。动作/API/资源快照按已接受合同和构建实测更新。Dataset 尚未合入 M，独立推进，不能因为 M/S/A 基线刷新而宣称 Dataset 已覆盖。

## M → S / A：只解决一份共享冲突

先由主 Session 合并 main 到 M，解决以下边界；然后分别将更新后的 M 合入 S 与 A。M 是二者共同祖先，不需要让 S 合入 A 或反过来。两条分支各自保留功能与证据。S/A 直接对 main 的额外冲突为 apps/local-host/README.md。

M 的 16 个冲突：home-side.ts；images-service-host.ts（修改/删除）；model-configuration.ts（jelly-model 重命名）；PLUGIN-DEVELOPMENT.md；SECURITY-INVARIANTS.md；package.json；Images README/actions；assistant-service-connections 的 spec/coverage（add/add）；ci-product-subset；goal-browser fixture；images-mcp；contracts/platform/plugin API 快照；baseline；page-assets。

关键裁决：

- 不恢复已删除的 ImagesHostService。main 的 enabled 检查和 disconnected/binding 行为应落到迁移后的公共服务；M 的 plugin-image-generation-service 已检查 connected，owner 检查 enabled，需要核对合并后仍在正确入口生效。
- model-configuration 保留通用错误归属与 connector-connection-views、enabled 检查，不能为解决重命名把 jelly 专属类型或旧 HostCompleteText 辅助路径恢复。
- Images 动作保留 Runtime 的异步、caller-aware save/delete，同时保留 #661 connectionUsages、connections.list v2、jobs.start v2。images-mcp 测试不得因 main 旧 v1 调用覆盖了迁移 v2 而退回合同。
- goal-browser fixture 的 allowDisabled 是主线明确可选行为，应保留；普通路径仍需保持 M 的等待 enabled，不把所有操作都变成允许 disabled。
- package security 测试清单与 ci-product-subset 合并有效条目，API/动作快照从最终合同重新生成，不靠手选快照证明合同正确。
- M 的早先资源 rekey 提交 01b7eec86 也需要对新 main 的更低基线重算，不能照抄旧键。

完成一次共享 build 与相关合同/安全/连接器验证，再排 S/A 的定向验证。A 的 LIFE 提交 f26f8216e 尚待主 Session 构建和测试，不应因刷新基线改变“工程验证待完成”的状态；S 同理以自己的已记录证据为准。共享核心最终全量按仓库并行规则由主 Session 串行安排。

## 只读预演证据

临时输出：`/tmp/queue-merge-todo.txt`、`/tmp/queue-merge-stream-todo.txt`、`/tmp/queue-merge-stream.txt`、`/tmp/queue-merge-dataset.txt`、`/tmp/queue-merge-model.txt`、`/tmp/queue-merge-shelf.txt`、`/tmp/queue-merge-alchemist.txt`、`/tmp/queue-merge-local-main.txt`。这些是辅助诊断，不是提交或测试证据；分支后续推进后应以当前 HEAD 为准。
