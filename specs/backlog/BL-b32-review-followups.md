# BL-b32-review-followups

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b32-review-followups | 第 32 批复审（头 `1ac3edcaee`）的三条非阻塞意见：① Images 失败的行把存下来的中文 `job.error` 放进任务行的说明，英文界面显示中文；根子是 Images 早就存了译文，要改成存键与参数（`TextRef`）。② 助理的 `follows` 端口只看最近 50 件、不含归档的工作，比对也不看提供方；任务在工作有图之前就结束时会多汇报一次。③ `AssistantStepGate.pass` 写询问时不核版本，旧对象可能让同一步再问一次（不会自己起轮）。 | [PR #2093 复审评论](https://github.com/molis-ai/molis-work/pull/2093#issuecomment-6898179457) | 代码质量 | 都是少见情况，不挡合并；① 要改 Images 的存储写法，超出本批 | 无 | 中 | 助理与 Images 的主人 |
