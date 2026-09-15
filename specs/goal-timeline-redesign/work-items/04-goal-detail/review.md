# 04 主 Session 独立验收：需要修正

2026-09-09。首轮 CLI 已停止。构建、边界检查通过；独立回归 104 pass / 0 fail / 0 skip，但下述真实入口复现失败，因此 **04 未验收，不是内部完整**。继续同一 Grok CLI 会话修正，不进入 05，不安装或迁移用户数据。

## 证据

主 Session 临时脚本均从仓库根目录运行 `node --import tsx --input-type=module < <脚本>`，使用真实 Host / Native Goals / Web / Chrome 与隔离 SQLite。启动端口和 Chrome 需要本地测试权限；首次沙箱 EPERM 不计为产品缺陷。

- `/private/tmp/molis-work-grok/04-review-http.mjs`、`04-review-http-results.json`：完整 Origin、control token、幂等头下，`kind=bogus` 返回 200，新增 kind=complete 的收尾事件，cursor 从 2 到 3。
- `04-review-history.mjs`、`04-review-history-results.json`：真实 demo CORE，limit=1 返回 3 条；转交并追加报告后 limit=2 的两页各返回 5 条，重复相同 Run/Evidence/Review。真实 self_verifier / runtime-core 被映射为 actor_kind=user。V1 初始文档有 4 条 journal，timeline API 返回空。
- `04-review-browser.mjs`、`04-review-browser-results.json`、`04-review-browser.log`：真实 pointer click，不用 DOM click 绕过可见性。6 个场景全部复现失败：新增要求表单不可见；Concern 原文/范围不显示；首个类型有两个必填字段时“补充一条”失败；保存抢走历史选择；写入成功而读取断线后重试产生重复事件；取消后没有可达的继续操作。
- `04-review-{build,tests,boundary}.log` 保存独立基础检查。生产截图在 `04-ui/`；补充真实操作截图在 `04-review-ui/`。后者 `user-534-reading.png` 是宽窗口内显式约束阅读容器，实际 Goal 宽 522px，不冒充已打开 Runtime。`mobile-type.png` 是操作后滚动位置，不是完整页面截图，不能据此做全页面通过结论。

## 必须按调用链修正的范围

### A. 一个完整、有界、来源可信的历史读入口

`event-history-map.ts` / `event-document-model.ts` 目前把全部 legacy 记录附在每个工作事件页上，游标只推进工作事件；HTTP 又遗漏了 journal 输入。必须让初始文档、后续分页、按 ID 读取使用一致的历史模型，真实接收顺序稳定，整体遵守 limit，跨页不重不漏，读取不改 owner。保留 Runtime 正向 after_cursor 接口。

不能把旧 Review 一律写成 user；从真实 provenance/obligation/Host 事实区分，不能可靠判定时保持未知。保留旧决定、原文、关联依据和更正历史，不把当前修订状态伪装成当时结论。当前 occupied object ID 过滤会丢掉相关 journal 变化，不能用丢历史换去重。索引不携带全部正文到每行 data 属性；正文按稳定原 ID 读取。不要只在客户端 Set 去重或限制 DOM 条数掩盖服务分页问题。

### B. 事件正文和定位须完整

当前客户端只完整展示 report 字段、progress.summary 和少量 reason/conclusion；Concern 仅标题，配置和其他系统事件多为标题/metadata。补齐 03 有限系统 payload 的人类可读正文：原约定/类型版本、Concern 的 statement/scope/依据、请求与用户决定的选项/结论/效果/范围、收尾的 result/reason/实际 unmet、继续与后续失效原因。旧 Run/Evidence/Review/Decision/journal 按真实来源读回。不要用 raw JSON 或“已保留原记录”占位代替内容。

工作规划里的 `data-locate-requirement` 当前没有处理器；完成要求中的 `data-locate-event` 只查已加载 DOM，相关报告在早于首屏的历史时无响应。两处都须能真正打开对应原事件，并保持可返回；不为定位拉完全部历史。避免服务端和客户端维护不一致的两套正文渲染。

### C. 完成用户能操作的规划与状态入口

- 新增完成要求表单嵌在 hidden reader 内，showForm 只显示子 form，实际不可见；修正面板/表单切换与返回、焦点。
- “补充一条”不能猜首个注册类型并只填写它的第一个字段。它是用户补充原话的入口，须在空白及任意已登记类型下可保存、无虚构完成判断。若需最小普通补充事件，沿当前唯一事件服务与有限合同实现，不引入第二事实源、不覆盖当前进展摘要来冒充普通补充。
- 已取消 Goal 虽有 hidden resume form，却无打开入口；已完成事件 Goal 连 form 都没有。让两种状态都能明确继续，旧完成历史保持，cancel/complete/resume 当前状态一致。
- 既有 04 合同中的可选规划采用、类型字段版本修改、正式约定修改尚未接入界面：当前只有采用来源文字，新增类型硬编码 version=1，没有修改当前结果的表单。补齐真实方法选择/来源与默认要求的独立采用、局部类型编辑新版本和历史按原版本阅读、正式约定带两版本的修改。空白起点不自动采用模板，不改项目级规划设置来冒充 Goal 局部采用。
- Concern 范围和用户决定沿 03 实际 scope/effects。当前 UI 的授权 action 硬编码 complete，无法承接 Runtime 对其他具体动作的请求；按实际待决定显示并选择其范围，不从文字推断。保留没有当前要求但能明确指出事件/动作的合法 Concern 场景。
- 动态字段必须真实驱动序列化；当前 report 排除了名为 title/requirement_id/verdict 的字段，且用普通对象写 __proto__。01 已支持这些合法字段 ID，Web 不得重新丢字段或混淆标题控件与内容字段。默认仍不作完成判断。

### D. 保存、读回、重试与选择是同一操作链

当前 submitForm 在 POST 成功后先删幂等键，再读取 document/state；两次读失败后提示保存失败，用户重试获得新 key，真实进展记录从 2→3→4。区分“未写入”和“已保存、读回失败”：后者仅恢复读取或沿原回执重放，不重复业务写入，不丢输入。读回失败时不能声称顶部已更新（refreshState 目前只改 data 属性）。

刷新前保留 Goal / event / reader / filter 的必要状态；当前 bindGoalEventDocument 每次强选第一条。新到事实、保存和刷新不抢走历史阅读，晚到请求不覆盖新选择。空筛选后重新选择/换筛选和更早分页保持选中、正文和筛选一致。

版本冲突不仅显示一句错误：读回当前实际约定/配置供对照、保留输入，并提供明确重新审阅后提交的恢复路径；不能静默换 token，不能要求用户丢输入重填。写入后的展示始终取当前事实，不能用旧幂等回执覆盖后来的反证。

### E. 当前状态与收尾反馈须忠于事实

HTTP event-close 严格拒绝未知/遗漏 kind，不把它默认为 complete；无效输入零事件、零状态改变。

页面要显示实际收尾结果与 unmet，包含真实依赖、人工验收、风险、Concern/待决定；不能仅弹“已保存”或写“当前没有挡住完成的事项”。工作规划/要求区区分 Runtime 报告、独立检查和实际用户验收，不把用户已验收又标成仍需验收。普通最新记录、未知/反证不能直接成为“已经做成”的结论。

### F. 验证与边界

先围绕上述根因建立可解释的最小完整方案，再动手；不要继续在缺字段的混合页上加过滤条件。沿原 04 允许模块，必要新增的有限读/补充输入由其既有 owner 持有；不重写已验收 01–03 的状态/权限语义。变更方案涉及新合同字段时先补 04 spec 的关键决策。

把已复现用例转成真正调用生产入口的回归，expected 不复制被测映射算法。不得用条件 if 跳过不存在的 Evidence、允许任意正文正则、仅等待旧 toast，或 DOM click 绕过被遮挡/隐藏的控件来证明完整。保留既有有效异步/恢复回归。

必须跑真实空白/采用规划→配置/版本更新→报告→Concern/用户决定→受阻完成→明确完成/取消/继续→刷新/读回故障重试→重启与历史阅读。主 Session 的独立脚本仍会重跑；修正后提供具体状态及副作用证据。重建与定向检查后一次批量复拍关键页面、实际窄容器、手机表单上下段/返回与主题，不再以错误命名或未加载截图证明完成。最终独立 finish review 由主 Session 调度。

05 仍负责最后死代码、旧默认协议/文档和全仓验收；测试引用本身不构成保留旧入口的产品理由。不要将这里已确认的功能缺口转入 05 或 later。
