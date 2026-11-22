# BL-skill-settings-installed-plugin-scenes

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-skill-settings-installed-plugin-scenes | `#2209` 合入后宿主已识别已安装插件在 Manifest `memory_scene` 申报的新场景，但技能设置页（`apps/workbench/src/settings-kit.ts`、`settings-skills.ts`、`browser/kit/scenes.ts`）与宿主技能/能力包汇报（`skill-catalog.ts`、`skill-workshop.ts`、`skill-import.ts`、`plugin-install-service.ts`）仍只读静态内置插件目录或磁盘留存包；此外沙箱包核验（`sandboxPluginManifest` / `readSandboxPackage`）尚未承接 `memory_scene`。需改为从宿主运行时当前作用域有效登记（内置插件 + 已安装且运行中、未撤权签名第三方插件）动态读取完整场景候选，停用/卸载/撤权后即时移除并拒绝新绑定，同步登记观测覆盖与合同快照，补齐真实签名第三方沙箱包生产路径集成与浏览器测试。关联批次：第 08、09、41、42 批（技能包/能力包/Skill 选用与创作）与第 44 批收口 `#2209`。 | `#2209`（`BL-b44-coding-scene-enum`）合入后审查发现（2026-11-22） | 已知缺口 | `#2209` 先把场景枚举从合同迁到内置插件与 Host 留存包清单，未将技能设置页面候选、沙箱清单核验与运行时停用/卸载/撤权失效闭环打通 | 无 | 高 | 技能与能力包负责人（`system.skills` / `horizontal/kit` / 技能设置页） |
