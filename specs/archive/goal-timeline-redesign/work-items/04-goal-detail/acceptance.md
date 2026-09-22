# 04 验收汇总

状态：已由主 Session 验收。2026-09-10。此处只汇总当前有效证据；历史失败与根因见 review.md、review-2.md，不能把早期通过覆盖后来的失败。

| 使用结果 | 当前结果 | 证据 |
| --- | --- | --- |
| 从正式页面配置、报告、Concern、决定、收尾，保存后重新读取当前事实 | 通过（含冲突重审） | goal-event-document.e2e、goal-event-review.e2e；04-conflict-e2e.log |
| 空白或另一 Goal 刚更新时，进展依据仍属于当前 Goal | 通过 | 04-recheck-response-loss、04-accept-cross-goal-progress |
| 合法内容字段不与判断控件混用；普通报告默认不产生要求判断 | 通过 | 04-recheck-edges |
| 原 ID 读取早期历史，超过旧静默截断边界仍可完整翻页，筛选与选中记录在保存后保留 | 通过 | 04-recheck-history-cap、04-recheck-edges；最终40项相关回归通过 |
| 丢失 POST 响应或成功后的读回失败可恢复，无重复事实 | 通过 | 04-recheck-response-loss、04-recheck-browser |
| 取消/完成后明确继续；同一续接请求重放和 SQLite/Host 重启后重放一致 | 通过 | 04-accept-resume-restart、goal-event-review.e2e |
| compact refresh 获得完整正文；同 Goal 选择保留，换 Goal 不串历史 ID | 通过 | 04-accept-refresh-and-guard、04-accept-goal-switch |
| 保存期间并发新增目标，自动刷新能同步侧栏；取消显示一致 | 通过 | 04-accept-save-tree-sync |
| 旧 Web 命令同键第二次拒绝，事件业务幂等例外不扩大授权 | 通过 | 04-accept-refresh-and-guard（201/409，无第二条 Goal）；无控制 token 仍403 |
| 冲突重新审阅期间，真实已编辑的理由不被自动刷新清空 | 通过 | 04-conflict-draft.log：真实刷新交错后理由保留、版本更新、没有额外工作事实 |
| 桌面、522px 阅读容器、390px 窄屏、真实暗色、旧历史可读 | 原六项视觉修正全部 resolved | finish-verdict.md；其中完整表单使用明确标注的390×1100视口，另有390×844滚动视口证据 |

脚本与日志位于 `/private/tmp/molis-work-grok/`，使用临时 SQLite、真实 HTTP 与 Chrome pointer 操作。没有访问真实用户项目数据库。最终两个事件e2e文件的3条完整路径通过；四个原根因脚本通过；主 Session 独立运行的40项正文/导航/刷新/历史/接续回归全部通过，无跳过。最终完整build、boundary errors=[]及git diff --check通过。日志04-conflict-{e2e,draft,refresh-and-guard,goal-switch,save-tree-sync,build,boundary}.log、04-accepted-regression.log。全仓测试与必需失效代码清理属于05，04通过不等于整个项目已达到内部完整。
