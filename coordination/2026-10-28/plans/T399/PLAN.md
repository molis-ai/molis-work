# T399 合成输入（供根更新唯一执行书）

绑定：T395 父 `b685fc0d81231a193d8dc2b6e4cee481ebc199b5`；T145 `afcc3de4720f13839e387632dd3b9966309d79c0`；T149 仅已提交前缀 `25f4ee5806b38b41a88c42715b35034aa3b06f49`，**仍待完整最终冻结，不是 READY**；T397 `e4e05dc5f96275aa4a396e38d1682f1286393021`。据根交接，T397 相对父 `a3b55dea2` 仅权限 E2E 跨平台路径修复，无生产/版本/hunk 变化，本页只更新绑定。

建议唯一 writer 从上述父**普通 merge T145 → T149 最终完整头 → T397**，只解真实冲突，再串行收共享候选。T397 已带 T149 SDK owner `40249032c` 及依赖元数据，不重复拣选或另写算法。T145 与父有多个 merge-base，已用自有提交识别差分，未把任取基点的父片差异当新改动；未创建合成树或宣称零冲突。

下表 Host 路径均相对 `apps/local-host/src/`：

| 真实共享 hunk | 两侧语义必须保留 |
| --- | --- |
| `home-plugins.ts` | T149 常量从 contracts/ui 取；T145 projectActions/同意服务、页面 project/assertProject，Home 身份仍 null；T397 retired 安装只供卸载重试，正常发现/enable 不复活。 |
| `plugin-builder/installed.ts`、`agent-surface.ts` | T149 SDK imports、真实 project/Home 目录、发布/下载活请求控制；T145 Host subject、capabilities(context)/projectReach/beforeEffect、真实项目前缀。 |
| SDK `sandbox-manifest.ts`/`index.ts` 及 owner 调用点 | 同一 T149 owner 保留 T397 四资源、shape/requested/operation 三份权限、Home DB 限 Home及只读不借 write；保原模型/生图/项目/text 派生，不用旧 owner 全文件回盖。 |
| `installed-plugin-host.ts`、`plugin-builder/exposed-actions.ts` | T149 SDK 取值；T397 项目平台 pluginHomeFor 文件桥、登记与 runInPluginAction 共用 finalDefinition。inProcess.admit 仍空，不另建 Runtime。 |
| `home-installed-plugins.ts`、`plugin-install-actions.ts`、contracts `platform/plugin-trust.ts` | T145 单 ledger 历史批准集合、project_reach record/实时复核；T397 DB/文件保留与卸载重试、requested 与 shape-only 不可授予；列表/同意输出取并集。 |
| Workbench `settings-plugins.ts`、同词典/测试 | T145 项目/动作名、费用、差量同意；T397 requested 显示/开关限制；最后只落 T149 SETTINGS-SCOPE.patch 的**安装目标一行**，不套旧整段 UI。 |

根串行收 API/actions、S107/S84、giant/baseline、assets/docs。当前 descriptor 为 **preview@5、installed.list@4、home.installed.list@3、两 setter@2、project_reach.list@2（grant/revoke@1）**；按最终 descriptor 生成，不算术升版。T145 旧 S84 preview@2 候选绝不盖回 @5；本项临时 S106 精确改 S107，保 T144 S105/T066 S106。旧 giant/资源 tuple 不套新头，按最终实测结算。

**一次组合回归接缝：** matching build 后，按实际解冲改变的输入，从现有完整文件取一批：`security-invariants-plugin-install.test.ts`（最终 preview@5/旧版拒绝；T397 末次 caller 修改后未完整重跑）、`security-invariants-plugin-permissions-http.test.ts`（两 setter/本人入口）、`plugin-trust-view.test.ts`（requested＋安装目标）、完整 `agent-built-plugins-workflow.test.ts`（Darwin实际UI-1物理下载/导入/运行/重载，Linux skip不结算）与 `home-package-project-reach.e2e.test.ts`（发布/下载/导入到实际安装目标、Home 身份＋触发项目同意、资源调用/撤回不串权）。未变原完整矩阵沿用；T149 作者未完成项不冒称通过，首败/未知保来源，最终准确头只排一次 CI Full。

依据：[T145](/private/tmp/t145-evidence/REPORT.md)、[T149 handoff](/private/tmp/t149-evidence/HANDOFF.md)／[单行候选](/private/tmp/t149-evidence/SETTINGS-SCOPE.patch)、[T397](/private/tmp/t397-evidence/REPORT.md) 与冻结 diff。本页非成员重审；T398 仍等 T397 实际采用。仅写本页，无源码/refs/coord/GH 写入，无 build/tests。

既有 agent-studio.e2e.test.ts 仅在实际解冲影响其输入时补跑，未变沿用。Runtime index 的 readProjectReachSubject 和 Home schema 两个导出普通合并保并集，不重造机制。

## 2026-11-01 14:28Z 统筹接受第四成员条件

根已核T402追加准备与实际已审hunk，接受[T402-ADDITION](T402-ADDITION.md)作为本书增量：T149完整最终冻结后可开始原三成员合成；只有T402完整最终头及独立验证/加强二审通过，才能普通merge为第四成员，在排最终Full前固定成员。顺序T145→T149→T397→T402，保T395最终父已有后续修复，合成仅一轮matching build/共享metadata/必要接缝/准确Full。T402若尚在必修，不消费WIP、不签四成员完成。此决定不增加产品语义或另开验收矩阵；原RAC2894～2896适用于最终冻结成员。T068单独接T395，不进本批；T398/T403严格实际采用前置保留。

2026-11-01 14:37Z执行绑定：T149改用完整最终a95e0f2a018667899a88dbca508e433a85a9ac43（独立审验通过），原前缀不得作为合入头。T399唯一writer已交t399_sol，先普通合原三成员，T402完整收尾及T395父单测试维护由根续交准确提交；整体build仍等最终源码与共享项一次完成。
