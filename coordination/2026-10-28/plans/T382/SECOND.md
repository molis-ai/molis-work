# T382 PR 候选独立代码二审

负责人：Codex 二审线。**结论：H `4f3d4d03e07a5701b74060e14d6bf9c8fa47881f` 的代码与书面范围相符，未发现当前必须修改项。** 这是只读代码二审；唯一待结是验证线4的最终独立验证。`full=false` 可作为本片建议交根裁定，不能由本报告替代最终门槛。

## 差异与行为

Git 确认 H tree `11853036c5dc2a65b732e7d087254f0764085d4e`、唯一父 B `3fd857792a27352030ac8f3544a3b57d418febc1`；作者工作树干净。实际重命名为 `apps/local-host/src/artifact-library-http.ts`，文件内容仅增加公开模块入口的 `type ArtifactImportResult`、两处 `invoke<unknown, ArtifactImportResult>`，移去原两处 `as unknown as`。旧 `ArtifactFileImport`/`ArtifactExternalImport` 类型仍被文件其他签名引用。两个调用的 action、input 对象、undefined 第三参数与 transport 第四参数均保持原位；泛型在运行时擦除。分支、输入校验、错误映射、响应状态与 URL 的源码顺序没有改变。`index.ts`、`web-composition.ts`、`web-goals-read.ts` 三条生产引用只换模块路径，公开函数名与导出不变。

`scripts/check-package-boundaries.mjs` 现在读取新文件并继续检查 `createLocalArtifactHttp` 与 Desktop import；独立的旧 `src/web/artifact-native-plugin-http.ts` 复活拒绝仍在。`NATIVE_PLUGIN_HTTP_FILES` 仅移除 artifact，磁盘上仅余批准的 `alchemist-native-plugin-http.ts`；两个 `APPROVED_BUILD_TIME_EXCEPTIONS` 未改。assembly 的目录/名单双向断言和 RAC-2746～2748 非插件平台路由 BL 出处循环均保留，BL-926 已从待办删除。

## 验证原件核对

作者三项临时负例原始日志分别在目标断言上失败：新增未批准 native 路由触发 `Plugin HTTP belongs to the plugin`；无 BL 的平台例外触发 `platform route exception must name its BACKLOG row`；不存在的 BL 触发 `BL-999999999 must still be open`。负例运行器在 finally 还原测试文件、移除临时路由，最终树干净；不是靠另一前置断言失败充数。

六完整文件原始日志为 64/64、两份边界文件为 97/97，均无 skip/retry；包含 S-55 的请求头路径、body 路径和非法 digest 拒绝。整体 build、boundary、准确 B 的 merge-base health、test-imports、文档/技能引用与 diff check 均有作者退出0原件；资源实测 48 项、7,469,195 B，逐项等于 B。上述动态结果保留作者执行归属，本二审未重跑。

旧名搜索仍有 34 处：活的历史说明添加当前新路径提示，归档/历史迁移原文保留，`src/web` 两处墓碑刻意保留，`tooling/gates/baseline.json` 是旧快查记录；没有把全仓旧名归零当成验收。活的当前实现路径已改；未见因改名抹去历史裁定。

`affected-tests` 给出 678 项宽匹配建议、`full=[]`，同时明确把 `web-composition.ts` 和 `web-goals-read.ts` 列为 `uncovered`，不能称 selector 覆盖了全部改动。两处实际 diff 均仅替换被导入的模块路径；H 中新模块的导出与原实现等价，整体 build/boundary 已解析这些路径。已有 `artifact-browser` 完整文件的 Artifact HTTP、Goal context 与状态刷新断言实际通过。覆盖判断基于这些内容和运行原件，不靠 selector 空集合，也不要求为两个纯路径替换机械跑完 678 项。建议本片 `full=false`，由根结合独立验证及集成输入最终定。

**交接：代码二审可过，无必修返修；等待验证线4的准确 H 独立结果。** 本线只读 Git/源码/作者原件，仅写本 SECOND；无产品、GitHub、build、browser 或 test 操作。
