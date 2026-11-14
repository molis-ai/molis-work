# BL-home-exports-cleanup

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-home-exports-cleanup | 第 15 批旧首页退出后仍有四个候选可清：①`apps/workbench/src/plugin-catalog.ts` 的 `homeStarts` 和它在 `apps/workbench/src/index.ts` 的导出已无产品消费者，只有测试在用（W5-06 的声明起点扩展点，删前要确认后续生成页面不需要）；②`horizontal/surfaces/src/index.ts` 的 `SurfaceCorrectionsDatabase`、`SurfaceCorrection`、`declaredAction` 三个导出在包外没有消费者；③`data-home-starts` 已从页面移除，但 `locale-switch.ts` 的属性表仍保留它：这行会进 `language-client`，与 ④ 一样改变词包 digest；④10 个 `workbench.project-home-shortcuts.*` 词条仍无引用。两者删除都会改变工作台词包的内容寻址，首屏门禁会要求新的 `userApproval`，本次保留，待资源批准后一起删 | [第 15 批](../post-anticorruption-roadmap/reference/batches/15.md) 收尾检查；[评审台意见 S6](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6823945201) | 明确后续做 | 删 `homeStarts` 会同时删掉 W5-06 的几条测试；它仍是生成页面/后续片可能使用的扩展点，未知是否还有人用时按仓库规则列为候选不硬删 | W5-06 扩展点与后续生成页面的消费者核对 | 低 | 工作台/组合服务（C 轨） |
