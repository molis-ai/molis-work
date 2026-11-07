# BL-background-inherits-page-locale

分组：9. 平台小项与工程流程 / 翻译与界面用词

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-background-inherits-page-locale | 今天的 `pageLocale()` 和 `L` 会让后台工作继承某个页面请求的语言：`AsyncLocalStorage` 被定时器和懒打开的对象继承，`web-server.ts` 又给每个请求一个语言，所以从页面请求的异步链上起的工作一直用那个页面的语言（实测：en 请求里起的定时器一直是 en）。已知的路：`assistant-dispatch.ts` 的 `continuations.watch`（之后 `assistant-service.ts` 以 `byHost` 开下一轮）、`packages/plugin-runtime/src/activation-jobs.ts` 的定时器和作业（`outsidePluginAction` 只退出插件范围，不退出语言）、`host.withProject` 懒打开的 Runtime。`web-locale.ts:8` 的注释说定时器里没有，不准确。后果：定时安排和后台轮次拿到的是最近一次碰巧起它的页面的语言，不是「最后一次用的语言」。A 段（第 14 批）不改这三处（决定 20）；第 16 批接第一处后台入口时，用 `runBackgroundWork` 统一处理（设计稿第 5.2 节），并更正那条注释 | [A 段合同设计稿](../font-and-skin-system/a-section-contract.md) 第 5.2 节「后台不继承请求的语言」 | 明确后续做 | A 段只给新的文字工具做了「范围结束即作废」和 `runBackgroundWork`，没有动今天的 `pageLocale()` 和 `L`；第 14 批 T10 只处理个人助理的入口 | 第 14 批 T8、T10 合入后（范围类型、`runBackgroundWork` 的类型）；落在第 16 批 | 中 | D 外观与语言（第 16 批主会话）；个人助理入口归 A 线（执行会话待分配） |
