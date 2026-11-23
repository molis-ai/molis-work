# BL-character-roles-sync

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-character-roles-sync | 角色的版本、项目里的角色（成员）及其版本、两层默认与采用回执进个人空间同步：今天跨设备只同步原件草稿、状态与导入快照，另一台设备上原件没有版本、项目里没有成员，要再保存一次才能选 （2026-11-22 决定 66 校准：Characters 于 44B 切纯平台 system.characters，个人层归本人级、项目层随分区同步，44B-0 同步修 ROLE_TEMPLATE_SCHEMA 前缀正则） | [角色服务设计 §8](../onboarding-coverage/role-service-design.md)；[第 36 批](../post-anticorruption-roadmap/reference/batches/36.md#batch-36-item-1) | 明确后续做 | 第 36 批只建本机的六张新表；同步要另定复制集合、成员 id 与版本号在两台设备上的冲突规则和删除墓碑，不借本批顺手加 | 个人空间同步（服务端批）的现行集合与便携格式；`characters/characters.sqlite` 的升级链 | 中 | C 轨 |
