# S-placement-conversion-source

| ID | 不变量与拒绝行为 | 代码位置 | CI 里跑 | 只在本机跑 |
| --- | --- | --- | --- | --- |
| S-placement-conversion-source | 放置服务从已向主人核实的问卷派生 `molis-source://form/` 地址。调用方给出的保留地址无效，其他来源的保留地址会被忽略，目标问卷已有的数据表不写入答卷。 | `horizontal/placement/src/index.ts` 的 `convertPlacement` | `tests/work-placement.test.ts`「S-placement-conversion-source: caller URLs cannot bind a conversion to another form's dataset」 | |
