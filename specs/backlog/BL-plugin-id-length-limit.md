# BL-plugin-id-length-limit

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-plugin-id-length-limit | `plugin_id` 的长度上限各处不一致：Manifest 解析（`packages/plugin-sdk/src/manifest.ts`，只验 `PLUGIN_ID` 正则）没有上限；`apps/local-host/src/plugin-install-actions.ts` 的 `controlInput` 和 `plugin-directory-http.ts` 是 200；`installed-plugin-consent-actions.ts` 和 `connector-plugin-slot-actions.ts` 是 160。结果：长度 161～200 的 id 能装、能用控制动作，却过不了授权确认和连接器槽位。要做的：定一个上限（建议在 contracts 里导出一个常量，Manifest 解析、四处动作 schema 和目录接口都引它），并让 Manifest 解析拒绝超出的 id，错误带上限值；改合同要走 `CONTRACT-CHANGES.md`，上限取值要先看已装插件里最长的 id | 第 14 批 A 段交办，读四处动作 schema 与 Manifest 解析核对 | 已知缺口 | 没有实际的 161 位以上 id；定上限是合同决定，要 C1 排 | 无；与 [BL-586](BL-586.md) 同在安装信任一带，可同一个人做 | 低 | C1／插件信任、声明与安装（执行会话待分配） |
