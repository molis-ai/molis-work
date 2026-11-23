# BL-installed-release-from-studio

分组：7. 平台与架构 / 插件运行与安装

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-installed-release-from-studio | 已装签名包的平台部分仍从创作台包取几样东西：发行物的形状（`AgentRelease`，`apps/local-host/src/installed-release.ts` 的 `InstalledRelease` 在它上面加 `packaged`）、零件排序 `inDesignOrder`（经 `plugin-builder-surface.ts` 转出，`installed-plugin-page.ts` 用）、模型替身前缀与能力描述（`MODEL_STAND_IN_PREFIX`、`studioCapability`，`installed-plugin-catalog.ts` 用），以及已装包选模型时读的存储键 `plugin-builder:agent-studio:model`（`installed-plugin-host.ts` 的 `INSTALLED_MODEL_KEY`）。47-1 C 后创作台是平台包，这些依赖不越过插件边界，但「签名生成插件」的发行物形状应是平台合同，不该由创作台定义；存储键改名要迁移（红线，先问用户）。 | 第 47 批 47-1 C 自查与只读评审 | 明确后续做 | 47-1 C 只搬包、不改行为；抽合同牵动已装宿主、Home 包与创作台三处，宜与 48 的安装预演一起做 | 48 批安装预演 | 中 | 插件运行平台主人 |
