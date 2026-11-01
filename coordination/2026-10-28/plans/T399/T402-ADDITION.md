# T399 追加 T402 的有限准备｜负责人：二审线5

**判断：可有条件作为第四成员，保持一次最终 Full；尚未获得追加授权。** 仅当 T402 最终完整头的独立验证、二审通过，且 T149 完整冻结后，由根决定是否纳入。任何审验失败则不进批；不引入 T068，不解除 T403 必须等 T402 实际采用的前置。

当前源码冻结 `557aefa51f1f681dc11e8648d45f84e148a813d3`；观察头 `d6870cf8397f82566e50d079da97abd87cc0ecfe` 仅把 dual-plugin fixture 改为现行 workbench.main/declarative-html，生产未变。若后续审验产生必修，以最终完整 H 重新绑定。建议顺序仍为 **T145 → T149 最终完整头 → T397 → T402 最终完整头**，均普通 merge。

**父依赖需准确表述。** T402 确含 PR1c c2d96、T149 SDK owner402及依赖元数据，也含较早 T395 d7d88；它不是最终父 b685fc0 的后代，实际有 c2d96/d7d88 两个 merge-base。它已有 a563 collaborator 修复，尚无 6f780 的 RAC1756 测试维护。第四次合入须保现有父的后续修复，不能把 b685→T402 的历史倒差量当成新实现或整文件带回；无需另拣已在合成父中的修复、owner 或元数据。

| 实际共享位置 | 合并时保留的合同 |
| --- | --- |
| Host `home-plugin-http.ts`、`web-request.ts` | 真实相接 hunk：T145 的触发 project_id、实际项目前缀、本人同意入口与 withProjectReachInvocation；T402 的实际 stage owner 捕获/await 后复核、read-only 声明子读、请求内 views 与有限 panels/overlays/surfaces。renderHomePluginStages 的 options 和调用要合并两侧字段；Home 执行身份仍 null，不能用触发项目替代。 |
| SDK `sandbox-manifest.ts`/`index.ts`、Host `sandbox-package.ts` | T397 主要改普通沙箱插件的四资源/三份权限校验；T402 改 integration 的 source_presentations 与固定纯 query/effects:{} 校验，实际位于不同代码段，保并集。仍使用同一个 T149 owner，不回盖 T397 的 requested/shape 区分，也不把纯展示变成连接权限。 |
| builder SDK 消费与依赖元数据、contracts/ui、Host 出口 | 保 T149 最终发布/CAS/真实 scope 与 T402 的 SDK 导入及展示/objects 合同；同源 owner 和已相同的包/lock 条目不重复拣选。T149 最终头尚未冻结，届时只核新增实际交叠，不消费当前 WIP 或重审其产品设计。 |

**证据与一次验证。** T402 独立者已核且输入未变的 owner/Feed/Inbox、presentation、沙箱矩阵沿用，fixture 后的有效结果由其当前双审结算，不另跑一套。若解上述 stage/auth hunk，最终组合用现有完整 `local-web-actions.test.ts`、`stage-data-declarations.test.ts`、`plugin-query-consumers.test.ts` 覆盖实际 owner、受限子读及 objects/有限 surfaces；与 T399 原批次合一次。既定的 project-reach E2E 和 **Darwin 完整 agent-built-plugins-workflow 文件/UI-1** 仍在最终组合输入上执行；agent-studio 不代签。原 S84 @5 整文件补验保持。

根仍串行做一次 matching 整体 build、API/actions、安全表 S43/S97、giant/baseline、实际资源结算及必要文档；T402 的 web-route-table 候选只改 board/no-token 两个探针的 keys，保其它路由、状态与拒绝，并核该完整文件。新增 Feed/Inbox stage/object 动作及 UI/presentation 合同快照从最终源码生成，旧资源 tuple 不抵算。四成员在排 Full 前最终确定，全部就绪后只排同一准确头的 Full；既有首败/未知保留。

本页仅为追加决策准备，未修改执行书或消费成员；只读 Git 边界与共享候选，未建合成树/refs、未运行 build/test、未操作 GH/coord，也未重审 T402 行为矩阵。
