# BL-work-line-bundle-duplicate-sdk-text

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-work-line-bundle-duplicate-sdk-text | 线的 bundle（`apps/workbench/src/browser/work-bar.ts`）把 SDK 的界面文字模块又打包了一份，工作台脚本里因此多出约 11 KB；改成和页面已有的那份共用（由宿主页把 `t` 与部件渲染交给 bundle，或并进同一个入口），做完后把 `tooling/gates/page-asset-allowances/32-work-line-script.json` 用掉的字节量回来 | 第 32 批页面资源实测与用户 2026-11-15 弹窗（[事项线](../work-line/spec.md) §12） | 明确后续做 | 第 32 批先把线做出来，用户批了本批上限 70 KB；去重要动工作台脚本的装配方式，不和第一片绑在一起 | 无 | 低 | 助理线 |
