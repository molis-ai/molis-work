# BL-client-script-comment-bytes

分组：9. 平台小项与工程流程 / 首屏加载与资源

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-client-script-comment-bytes | 工作台客户端脚本里写在模板字符串中的块注释原样下发到 `molis-work-workbench.js`，仅第 07 批 S2 的部分就约 5 KB | [#1867](https://github.com/molis-ai/molis-work/pull/1867) 评审台不挡合并的意见（同意单独登 BL） | 明确后续做 | 要在页面资源构建里统一去掉注释（`SIDE_PANE_FACTORY` 已用 `.replace(/^[ \t]*\/\/.*\n/gm,"")` 去掉行注释，可照这个做法推广到块注释与其他脚本，或把说明挪到 TypeScript 注释），会让多个资源一起变小，适合单独一片、对照页面资源门禁一次量 | 无 | 低 | 工作台页面资源（D 轨，具体会话待分配） |
