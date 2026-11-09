# BL-skill-import-project-directory

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-skill-import-project-directory | 从项目目录导入技能（`skills.import.preview@1` 的 `project_directory` 来源，现在以 `skills.import_source_unavailable` 拒绝）：先定它自己的读取授权。已有的目录授权属于某个插件安装，借来给导入用会改变它的含义；一个办法是用系统的目录选择器做一次性授权。定下后接上来源、只读授权目录之内，并补拒绝测试 | [技能包 spec](../skill-packs/spec.md) §9 2026-11-08 用户定 ② | 明确后续做 | 第 08 批不做：读取授权的来源要先定，不能借插件安装的目录授权 | skill-packs 的导入（08-8） | 中 | 技能包维护人，导入（后续批次，执行会话待分配） |
