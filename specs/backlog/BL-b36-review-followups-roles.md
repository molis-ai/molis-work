# BL-b36-review-followups-roles

分组：9. 平台小项与工程流程

第 36 批 PR #2111 评审台（头 d7e30eaa9c）列出的角色页不挡合并的小修，没有在本批做的。

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b36-review-followups-roles | 角色页：Coding 首轮取默认角色时 `listRuntimes` 调了两次；`toggleDiff` 显示差异的那一节判断错、上游提示两节都改时标题只说第一节、抽屉冲突差异只比做事方式不比工具；`renderAlert(...).replace(/<\/div>$/u, …)` 改为给 `renderAlert` 加尾部插槽；「存到我的原件」多次请求不在一个事务里（后一次被拒时前一次已写）；e2e 补导入角色「来源」可见的等价检查；页面上就地展开的停用确认和添加面板按 Escape 关闭并让焦点回位；添加面板的候选不全用 primary 按钮；`source-ladder.ts` 文件头注释更新；能力包条目新加的提示由直写中文改成 TextRef。第 6 轮（头 6ad395da00）补：来源阶梯各层加平台的 `:focus-visible` 描边；RAC-2850 在 390 px 加触控尺寸检查；coding-session-follow 把观察任务那次读在四例里都挡住（现只挡被拒调用的两例）；`home-store-baselines` 的注释写明 characters 为 v2；查 `agent-action-selection.e2e` 在头 0498cee74a 的全量里 Linux 连败两次的原因（重开 Coding 会话后草稿没回到输入框；之后两次全量与本机都通过） | 第 36 批评审台 | 明确后续做 | 不挡合并；多为界面细节，随 ROLE-14 本人看实物一起改更省事 | BL-b36-roles-acceptance | 中 | 角色负责人 |
