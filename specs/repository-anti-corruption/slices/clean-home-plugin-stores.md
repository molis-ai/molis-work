# 干净 Home：Pages、Form、Issue 与派生搜索索引起点 1

状态：执行中，负责人 Codex（设备 A）。按统筹 #1332 6517794305、6518319207、6518340875 的第四片，冻结main180116cb00。真实重建未开始，等用户另说“开始”。

三份插件库声明2→1，搜索缓存元数据2→1；现行DDL、owner、项目行登记、权限、动作/成果协议、实体修订及产品版本不变。其他已为1的插件库保持；连接库等#1564交接，server与IM共用结构/邀请拒绝，留第六片一起删除旧工具，不在此并改。

保留搜索索引的既有例外：它是可重建派生缓存，缺失、损坏或版本不符会清空缓存并从事实owner重建；不把它改成事实库升级、读取兼容。三份事实库仍按现有版本拒绝，无升级。独立当前DDL夹具保留，Issue现行DDL加独立冻结夹具用于完整schema对照，不引入旧结构。

- RAC-2368：Pages/Form/Issue经Host公开库装配新建并重开为1，完整结构与冻结现行DDL一致，integrity_check=ok、FK为空，原项目行与权限声明不变。
- RAC-2369：完整当前DDL及业务行却版本2时开库拒绝，原文件字节/行/结构不变；不就地升级。
- RAC-2370：搜索当前元数据1，正常重开保留已有缓存；版本不符仍按既有缓存合同重建，搜索结果与从owner重建前一致，权限拒绝不放宽。
- RAC-2371：保留各包README要求的动作、版本发布/恢复、项目删除、MCP与撤权覆盖；只改存储起点，不把实体版本或Action版本归1。

证明：`tests/clean-home-plugin-stores.test.ts`、`tests/home-store-baselines.test.ts`、`tests/system-search.test.ts`，加Pages/Form/Issues/Storage README并集与直接影响用例。先整体build，再公共machine-slot下jobs1与一次性Home/专用测试浏览器。health/base、boundary、40库版本表、secrets；Full由统筹排，甲档Codex B验证与Opus high二审另交接。真实Home、旧副本、安装、服务和Keychain均不读写。

工程候选验证（2026-10-30，冻结main180116cb00）：整体build、health/base、boundary、48项页面资源7,493,290字节、40项存储版本表通过；核心5文件64项、README与直接影响其余38文件全部通过，共43个不同文件。测试使用公共槽、jobs1、临时Home；未跑本机Full。新增版本清单行后先后发现缺维护账条目和表格被空行截断，均修文档后重新过原门禁，未改门禁或基线。独立验证、二审、合入与真实重建尚未完成。
