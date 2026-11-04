# 第 02 批 · 旧协调单核对

[第 02 批交付](batches/02.md#batch-02-item-1) · [现行待办](../../BACKLOG.md) · [旧协调分支原表](https://github.com/molis-ai/molis-work/blob/22fe801a021ffac1b16d4000aef9b3584f9cf882/coordination/2026-10-28/MISC.md)

原表里同一任务会出现几次。有的行已经指定后续任务，有的行只有一半随之合入。下表用原行号定位，按具体行为记录去向。文件通过数引自防腐最后一次[集成 Full](https://github.com/molis-ai/molis-work/actions/runs/41710265080)；它的树与合入头 `8de0b0740` 相同。

| MISC 原行 | 接手后的行为与证据 |
| --- | --- |
| 7 · T-031 | [#1353](https://github.com/molis-ai/molis-work/pull/1353) 删除工作台没有调用方的页脚函数，#1372 更新清理清单。本批补正防腐归档中两句仍写着“待删”的文字。 |
| 8、T-342 后记 · macOS 剪贴板 | 两次旧作业在读原剪贴板时失败，新提交成功；没有确定根因。共用 BL-972。 |
| 9～11 · T-155 | T-175 的 RAC-1835～1837 在确认入口拒绝相撞的 ID 与不合条件的升级，先于固定发布者或保存包。宿主与 Runtime 各自判断点分嵌套的重复实现保留 BL-970。 |
| 12～13 · T-057、T-071 | [T-057](decisions.md#policy-t057) 的错误出口仍实测为 400，目标为 500，归 BL-969。[T-071](decisions.md#policy-t071) 复测了本人连续两次操作及工作内拒绝。 |
| 15～16 · T-154、T-157／158 | 助理到期提醒标题的两个截断点仍归 BL-971。Pages 导出文件名、图注、选区及光标上下文随 [#1563](https://github.com/molis-ai/molis-work/pull/1563) 合入；导入预览、引文和评论侧栏随 [#1608](https://github.com/molis-ai/molis-work/pull/1608) 合入。浏览器实际导出及预览边界所在文件分别通过 6/6、4/4。 |
| 17～18 · T-167、T-184 | S-03 漏列的旧 Goals 地址重放拒绝归 BL-914。另存文件名在 [T-223](https://github.com/molis-ai/molis-work/commit/bb5f4ce566) 保住扩展名；RAC-2164 真实保存了 100 个 emoji 加 `.html`。 |
| 20～22 · T-183、T-192 | Host 情境请求上限、工作台选区和标题分别由 [#1462](https://github.com/molis-ai/molis-work/pull/1462)、[#1687](https://github.com/molis-ai/molis-work/pull/1687) 保留整字；相应用例文件 11/11、16/16。W4-11 在 [运行时迁移历史](../../../docs/system/RUNTIME-MIGRATION.md)已注明 #542 合入，以及后来改由 Manifest 声明库的时间。 |
| 34 · T-210 | [#1572](https://github.com/molis-ai/molis-work/pull/1572) 统一引导页和宿主项目名的字数上限。RAC-2250／2252 覆盖含两单元字的 120 字项目名和超限拒绝，文件 57/57。材料标题交成果库仍由另一个待办 BL-944 跟踪。 |
| 45 · T-223 | [T-231](https://github.com/molis-ai/molis-work/commit/63a1536b77) 修好 Host 下载名与 Shelf 留存名的截断和扩展名。RAC-2200、2201 所在文件分别通过 8/8、7/7。 |
| 48 · T-213 | [#1550](https://github.com/molis-ai/molis-work/pull/1550) 将 Plugin Runtime 源码纳入共享核心全量建议。RAC-2401 核对源码改动与纯文档的区别，测试文件 85/85。全量由集成分支安排。 |
| 50 · T-227 | [#1567](https://github.com/molis-ai/molis-work/pull/1567) 补了关闭途中安装记录消失、关闭失败传播及另一安装处理的用例。RAC-2407 所在文件 9/9。 |
| 54 · 大块代码着色 | [#1532](https://github.com/molis-ai/molis-work/pull/1532) 分开首次整块布局和后续着色，代码布局文件 5/5、着色规模文件 9/9。历史负载下的首败保留。 |
| 56 · T-112 | [#1547](https://github.com/molis-ai/molis-work/pull/1547) 补了入口扫描的扩展名用例。RAC-2297 能检测从 .mts／.tsx 入口漏扫 Goals 依赖，所在文件 11/11。 |
