# S-work-line-person-doors

待审操作的卡片只接受当前项目、任务提供插件及其精确安装、Agent 会话都匹配的队列记录。提交需携带页面看到的版本和受保护 Web 入口签发的本人操作，提交前会重核任务提供方的授权。见 `apps/local-host/src/mainline-held-reviews.ts` 及 `tests/mainline-background-tasks.test.ts` 的 WLHR-01／02。

事项线的标签页暂存只保存事件和读取状态。待审记录的引用和正文需从受保护的入口重读，见 `tests/work-line-event-tab.e2e.test.ts` 的 WLHR-02。

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-work-line-person-doors | 工作台通往事项线、后台任务总表和要求栏的入口只回答本人自己的页面：`/api/mainline/*`（线、等你的数、任务总表、任务命令、回答决定、改去处、事件卡、对象打开到哪里、把已办的事放到 Shelf）和 `/api/acceptance/*`（读、认可或退回、本人改要求）在调用任何动作之前先看这次请求是不是插件页面发的——插件自己的 frame 发的和以它的页面名义发的都算——是就拒绝，不读、不写；页面一次读齐的 `/api/attention` 对插件页面不给线和任务两部分。入口以本人身份调用动作，本人这次页面请求就是 `user_action`（S-58），调用者、受众、项目都从请求来，写在请求体里的同名字段不读（合同不认的字段整次按输入无效拒绝）；别的项目读不到这个项目挂的要求。插件要读自己的任务、停自己的任务，走自己的动作 | `apps/local-host/src/person-action-http.ts` 的 `handlePersonActionRoutes`；`apps/local-host/src/mainline-http.ts` 的 `mainlineAttention`、`handleMainlineHttp`；`apps/local-host/src/acceptance-http.ts` 的 `handleAcceptanceHttp`；`apps/local-host/src/mainline-event-surfaces-http.ts` | `tests/security-invariants-work-line-doors.test.ts`「S-work-line-person-doors WLN-39 PWA-144: a plugin's page gets nothing through the person's own doors — the line, the task table, a command, an answer, a placement, an event's card, a requirement's reading, acceptance or change — and nothing is written; the person's own page gets through」；`tests/security-invariants-work-line-doors.test.ts`「S-work-line-person-doors PWA-144: the person's doors take who is asking from the request, never from its body — an actor, an audience or a project written into the input changes nothing, and another project reads none of it」 |  |
