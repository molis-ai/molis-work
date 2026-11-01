# T146 最终 M 同步交接

已正常merge准确M，候选干净冻结，未push/GH/Full。实际tree与NEXT预测一致；相对M仍六路径，自有增删行全等。四个非资源文件同b2cb，privileges另保T382顶部说明；其余main输入全部保留，未改T384许可或旧EOF P2。详见 `final6729-binding.json`、`final6729-scoped.diff`。

| 绑定 | 值 |
|---|---|
| 前候选 | `b2cb0e158a68ebf1d056f47924de1075338ebd0f` |
| M | `6729a2d4655caa603daa369f99884e09c4726bde` |
| 最终N | `c35ad3036b7ed2e296d5b1b6fce383546b1dafb9` |
| tree | `da3f567c3c350576972579cea05cf803269c14db` |
| 树/分支 | `/private/tmp/t146-current-sync/wt` · `feature/t146-current-sync` |
| H产物状态 | 树与dist保留、tracked clean；manifest：`/private/tmp/t146-current-sync/wt/dist/.molis-work-build.json` |
| H production digest | `534855835667132822612e600e3e7393ea5b15985e335531b79d351c4e86d853`；当前重算与manifest相等 |
| M产物状态 | 原树`/private/tmp/t146-current-sync/final-base`在最新保留通知到达前已正常移除，移除时干净；dist/manifest已随树删除，production digest未另存，不能提供该值；按通知不重建 |
| 视觉接续绑定 | `visual-build-binding.json`；H可供verify4复制到独立树，M仅保留构建日志与served捕获，不能提供可复制产物 |

候选和精确M参考树均在公共槽完成匹配整体build，系统HOME/Foundation/XDG隔离、file/adhoc。未借用缺T382输入的T383旧产物。两端实际serve捕获48项，只有settings.css 904914→827276（−77638 B），其余47项字节及SHA256全同；参考树已正常移除。旧b2cb证据保留于 `b2cb-REPORT.md` 及原日志。

| 本轮原件 | 结果 |
|---|---|
| `final-build.log` / `final-base-build.log` | 整体构建通过 |
| `final6729-assets.json` / `final6729-base-assets.json` / `final6729-resource-comparison.json` | 48项真实对照，仅settings下降 |
| `final-health.log` / `final-boundary.log` / `final-test-imports.log` | 通过 |
| `final-page-assets.log` / `final-plugin-styles.log` | 通过 |
| `final-fetch.log` / `final-secrets.log` | 通过，68行 |
| `final-diff-check.log` | 旧EOF空行P2仍报；未修改 |
| `final-remote-readback.txt` | main仍M；PR分支仍旧1507e2034 |

旧Node14、67/三M分源沿用，没有重复运行。按6543667203，准确新头Linux Full及NEXT列出的七完整browser文件由根结算，视觉仍待二审；旧10/39、基线0/38、组合47/48及19/21、UNKNOWN和HOLD均保留。工程检查不代签Full、视觉、产品实操或用户验收。
