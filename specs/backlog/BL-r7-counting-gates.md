# BL-r7-counting-gates

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-r7-counting-gates | 对抗式审查 R7 里三组新的「只许减少」计数门禁：① 会到达调用方的裸 `new Error(`（D3／E2／G4，生产代码约 1,720 处，内部不变量可留，其余改 `defineErrorCodes`）；② 死翻译键、宿主行数、只走 HTTP 的写入、注释里的过程编号（B8／G5）；③ 代码与测试注释里已关的 BL、T-、batch、日期编号（E1，S-xx 与验收编号保留） | [对抗式审查台账](../../docs/reviews/adversarial-review-2026-11-01.md) B8／G5、D3／E2／G4、E1；[决定 37](../post-anticorruption-roadmap/reference/decisions.md#decision-37) ③ | 明确后续做 | 用户 11-11 定第 27 批不做新计数门禁，只记待办；新门禁要改门禁脚本，需再经用户批准 | 死翻译键先按 10-20 计划换稳定键 | 低 | C 轨（执行会话待分配，需用户批准） |
