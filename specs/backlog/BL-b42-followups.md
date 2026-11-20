# BL-b42-followups

分组：7. 平台与架构

2026-11-19 归档记录：原 ③（`?draft=` 地址消费、缓存切换防丢输入及个人空间 `home_href_template`「打开草稿」入口，见 [QF-56](../quality-experience-audit/report.md)、QF-60）与原 ④（能力包页改用 `@molis-ai/molis-work-design-system/navigation` 的 `renderTabs` 与 `renderToggleGroup`，见 PF-14）已随 [#2101](https://github.com/molis-ai/molis-work/pull/2101)（`f5efe316a2`）合入 `main`，不再列为待办；已删技能的未放弃草稿也已在能力包顶部草稿区露出以便读取和放弃，⑥ 仅保留「技能已删除」标识的小修。其余子项仍保留，整条 BL 不关闭。

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b42-followups | 第 42 批「Skill 创作与改进」评审留下的非阻塞项（原 ③④ 已随 #2101 合入归档）：① 宿主文字模型这条口（`HostCompleteText`）只交回文字，Prologue 回执里的模型与用量没交给调用方，平台没有一处记它的用量；补上后，技能回放（设计稿 §2.3、§3 的 `skill_trials`）、第 41 批的起草、信息动作一起按回执记账，不各存一份；② 采用了改一份、原来的没关上时，提示是「已采用」加失败原因两句拼接，换成一句专门的词条（随下一次动工作台词包时做，免得为一句话多换一次首屏词包路径）；⑤ 同一技能有两份草稿时，后采用的会盖掉先采用的那一版，采用条上没说；⑥ 删掉一个技能后它的未放弃草稿会在顶部草稿区显示供读和放弃，采用以 `skills.authored_unknown` 拒绝——可考虑在列表项上标明「技能已删除」；⑦ 删除技能的撤销只恢复字段与状态：`remove` 已清掉 known answers 和来源，`undelete` 从字段重建、版本从 v1 起；要完整撤销需要软删除保留这些记录，或把提示写成「只恢复内容」；⑧ `recent_uses` 按 `install_id`、`skill_id`、`caller` 计数，不含 version，采用后旧版本的使用仍计入，不能单独证明新版在助理与 Coding 用过 | [第 42 批](../post-anticorruption-roadmap/reference/batches/42.md)、[PR #2107 评审](https://github.com/molis-ai/molis-work/pull/2107#issuecomment-6923974827) | 明确后续做 | 不挡本批：①要动宿主文字模型的口与所有调用方；②⑤～⑧是体验与写法的小修 | ① 无；其余无 | 中 | 技能包维护人 |
