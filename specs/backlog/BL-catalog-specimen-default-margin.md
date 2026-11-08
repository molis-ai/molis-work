# BL-catalog-specimen-default-margin

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-catalog-specimen-default-margin | 组件板（`/__ui/catalog`）里 `figure.mw-catalog__specimen` 在多数节保留了浏览器默认的左右 40px 外边距，320 宽下标本显得挤。基础规则 `packages/design-system/src/styles/primitives.ts:881` 没有 `margin: 0`；外观、输入框两节（`primitives/catalog-appearance-styles.ts:12`、`primitives/catalog-composer.ts:75`）和平台区域、服务连接两节（`apps/workbench/src/platform-area-specimens.ts:38`、`service-connection-specimens.ts:130`）各自局部重置成 0，别的节没有重置，仍是默认外边距。要做的：在基础规则里重置一次，删掉这四处局部重置；`primitives.ts` 的样式也进产品样式表，所以要对照页面资源门禁，做到字节只减不增，并用 320、390 宽看一遍全部标本节 | 第 14 批 T8b（`444c563ba`）给外观节加了同样的局部重置；composer 节的来自 K1（#1850），服务连接的来自第 13 批（#1862），平台区域的来自第 18 批（#1929） | 已知缺口 | 只影响开发用的组件板，不影响用户；T8b 只改自己那几节，不顺手改全板。动共用样式要跑 `pnpm visual:compare` | 无 | 低 | D 外观与语言／工作台外壳（执行会话待分配） |
