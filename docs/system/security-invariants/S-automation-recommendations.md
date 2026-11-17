# S-automation-recommendations

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-automation-recommendations | 扫描只读本人当前项目获准的目录和固定配置路径，读取范围之外的内容、符号链接、撤销中的目录与其他项目均拒绝。建议文本不能安装、运行或写工作区；跨项目保存引用和旧偏好 revision 不写报告或设置。 | `horizontal/automation-recommender/src/scan.ts`、`apps/local-host/src/automation-recommendations.ts`、`apps/local-host/src/automation-project.ts`、`apps/local-host/src/automation-recommendations-http.ts` | `tests/security-invariants-automation-recommender.test.ts`「AUT-01–05」「AUT-01/05」「AUT-02–07」 | — |
