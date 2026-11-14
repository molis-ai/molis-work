# BL-schedule-one-off-detail

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-schedule-one-off-detail | Schedule 一次性任务的详情与编辑两处：① 编辑一次性任务时「每天的时间」藏起来了，但没有一行只读文字写出它哪天几点跑（D 轨合审建议）；② `plugins/native/schedule/src/ui.ts` 给 `repeat: "none"` 的任务带上 `data-schedule-task-once`，现在只有浏览器用例里手动加这个标记来测表单，渲染时会不会真的带上没有单元用例（评审台小修，补一条 `renderTaskDetail` 的 `repeat: "none"` 用例） | 第 17 批 PR #2058：D 轨合审确认 e3bf5ce0d8、评审台对 e3bf5ce0d8 的复审 | 明确后续做 | 都不挡合并：一次性任务今天只由风险复查登记，详情里已能看到下次运行；①是一行界面文字，要过 D 轨，随下一个碰 Schedule 页面的批次做 | 无 | 低 | 碰 Schedule 页面的下一批主会话 |
