# T388 本地候选交接

作者 RAC-2829/2830 工程验证通过。M `6729a2d4655caa603daa369f99884e09c4726bde`；H `45abd242013a428d79e750503159ee580fa33ba7`；tree `5ab65df733c83d7881a1f6b6cf624d8cb7da4bb3`。独立树 `/private/tmp/t388-dev`，分支 `feature/t388-await-pause`，状态干净，只有原测试一行增加 `await`。

已核 `pause → CodingSessionStore.setState → transaction`：事务先 await beforeEffect，再 BEGIN/UPDATE/COMMIT 后返回；新调用等真实 Promise 完成才发原 visibilitychange。原全部 STOP-FEEDBACK 断言、10秒 DOM 窗口、stop 屏障、合成进程/Runtime、未知不重试及 owner 投影不变；未做可选实验、加 owner read 或诊断机制。

没有可核收的现存匹配产物，故离线冻结安装后在公共 build 槽整体构建。最终生产 digest `ed2596f14b20160c8be9477f4172e7269cf2752399a30f2f0713eaaeb1d0a872` 匹配 manifest，关键包实际解析到本树 dist。完整原文件只自然运行一次，公共 browser 槽、jobs1/retries0：**1/1 pass，0 fail/skip/cancel/todo/retry**。导入图、boundary、准确 M 的 health、diff-check 均通过。affected 仅该文件，实际 `full=[]`，本片无全量建议。

原日志保留 `actions.missing`、`actions.host_closed`/`host.closed` 的 warn/error 行；没有测试断言失败，不将日志改写为消失。旧 T385 Full `41271185187` paused 首败及内部 retry 的因果仍 **UNKNOWN**；本次不归因或销账。未 push/GH/CI/Full，独立验证与二审、后续发布由根结算。

系统 HOME/CFFIXED/XDG/TMP/MolisHome、file backend、ad-hoc 与专用 Chrome 均按原件配置；公共槽在 TMPDIR 隔离前固定。Foundation 用户路径隔离通过，系统临时目录仍未隔离。测试自然退出后无本轮目录 open handle、无专用 profile 进程；仅清本轮临时目录，工作树、构建及原件保留。T384/其他作者树未修改。

原件：[最终绑定与全部退出码](/private/tmp/t388-evidence/FINAL-STATE.json)、[单行 diff](/private/tmp/t388-evidence/candidate.patch)、[静态真实调用链](/private/tmp/t388-evidence/STATIC-ORDER.md)、[测试原件](/private/tmp/t388-evidence/execution/stop-feedback.raw)、[测试 H/环境绑定](/private/tmp/t388-evidence/execution/test-binding.json)、[构建与实际解析](/private/tmp/t388-evidence/execution/gates-build.json)、[whole build](/private/tmp/t388-evidence/execution/whole-build.raw)、[affected](/private/tmp/t388-evidence/execution/affected.raw)、[health](/private/tmp/t388-evidence/execution/health.raw)、[imports](/private/tmp/t388-evidence/execution/imports.raw)、[boundary](/private/tmp/t388-evidence/execution/boundary.raw)、[公共槽](/private/tmp/t388-evidence/public-slot.json)、[原生路径限制](/private/tmp/t388-evidence/execution/path-limits.json)、[cleanup](/private/tmp/t388-evidence/cleanup.json)。
