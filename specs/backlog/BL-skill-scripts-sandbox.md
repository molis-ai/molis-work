# BL-skill-scripts-sandbox

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-skill-scripts-sandbox | SKP-09：技能 `scripts/` 里的脚本在这一轮的权限岛和沙箱里跑（[能力包设计稿](../capability-pack/contract-design.md) §3.6 的 9-5b）：宿主经 `skills.resource.read@1` 按声明路径读、核摘要，放进这一轮的宿主临时目录，沙箱只读放开这一个目录，角色有 `run-command` 时由模型调起；配不变量 `S-skill-scripts` 与拒绝测试（只跑声明过、摘要相符的；只在临时目录、按角色的执行权限；项目目录读写照角色原样；超时与失败按失败报）。在那之前宿主不执行任何技能脚本，目录与导入页只标「会运行」 | 第 09 批 9-5b 按[开发流程第 8.4 节](../post-anticorruption-roadmap/reference/development-workflow.md#batch-grouping)移出 | 明确后续做 | vendored Prologue 的 Node Host 报 `sandbox: "absent"`，`run-command` 只有沙箱档（只读档拒命令、可写档不另隔离），没有给命令另开一个只读目录的接口；「只在沙箱里跑」现在做不到真，换 Prologue 包是红线 | 命令跑在操作系统沙盒里（[Coding 体验优化](../coding-harness-optimization/spec.md)的命令规则：macOS `sandbox-exec`、Linux `bwrap`），或 Prologue 提供带只读目录的命令沙箱 | 中 | C2 轨；去处第 62 批第 1 项（四策略、SDK 补缺与逐服务验收的 Skill 策略余项）：换包后 Node Host 若给出带只读目录的命令沙箱就随它做；若命令沙盒由第 65 批第 2 项（受限命令）交，则随第 65 批做 |
