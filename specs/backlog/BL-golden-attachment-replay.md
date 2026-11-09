# BL-golden-attachment-replay

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-attachment-replay | 两处金样回放的缺口。第一，金样数据段第一次移去发布附件时，CI 回放怎样取到附件、取不到算什么，还没定。第二，按行读的格式条目（JSONL 一类）回放只比第一行，后面的行变了看不出来 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批收尾 | 明确后续做 | 第一份金样体积还小（约 4.4 MB），先入库；按行比较要先定每种格式的读法 | U2（`specs/upgrade-continuity/golden-replay-design.md`） | 中 | C1（执行会话待分配） |
