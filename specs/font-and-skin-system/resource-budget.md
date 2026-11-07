# 字体皮肤语言：首屏实测与资源预算方案

状态：方案待用户决定（2026-11-07）。实测已完成，预算规则只提方案，未改门禁、CI、页面资源许可和产品代码。这是[决策第 23 项](../post-anticorruption-roadmap/reference/decisions.md#decision-23)其余部分的依据，呼应[实施方案 §12.2](implementation-plan.md)。

验收编号：不适用（方案文档，验收在第 14、16 批的实现里）。

## 1. 结论

1. **门禁量的只是一小半，日常访问几乎全在门禁外。** 第一次打开，门禁量到的字节占 36%～66%；再次打开，只占 0.0%～0.1%，因为 HTML 是 `no-store`，每次都整份重发，而门禁量的 `/assets/` 文件只回 304。
2. **英文页每次多发 1.9 MB。** 语言目录内联在 HTML 里（英文 953,817 B，中文 214,759 B）。工作台和到达页都还带一个隐藏的侧栏文档，所以目录每次发两份：英文 1,907,626 B、中文 429,514 B。
3. **这些目录第一屏几乎用不到。** 主文档第一屏的代码只读了英文 23～118 条（共 11,558 条），约 1%；中文一条都没读。
4. **把目录挪出 HTML 是最大的一笔节省。** 再次打开时，英文工作台从 2,573,362 B 降到 666,388 B（少 74%），中文从 1,093,174 B 降到 663,660 B（少 39%）。第一次打开也少：英文少 1,317,829 B，中文少 429,514 B。
5. **令牌去重加删 tray／pill，每张样式表只少 17,443 B（gzip 约 4 KB），也只在第一次打开时省。** 值得做，但不解决预算问题。
6. **字体的代价目前看不到。** 这台 Mac 上中文后备字体一次都没下载，因为系统字体够用；Noto Sans SC 只有在缺系统字体时才会多出 1,141,536 B，这种情况没量（第 3.6 节）。

## 2. 测量方法

| 项 | 值 |
| --- | --- |
| 提交 | `d125b36f5`（main） |
| 机器 | Apple M5 Pro，15 核，24 GB，macOS 27.2，Node 24.22.2 |
| 浏览器 | 本机 Chrome 156.0.8078.80，headless，`locateTestChrome` 选的那份，每次冷启动用全新资料目录 |
| 日期 | 2026-11-07 18:54～18:59（CST） |
| 负载 | 量的时候 1 分钟负载 5.4～10.8，中位 8.7，同时有别的会话在跑。**时间只作相对参考** |
| Host | 真实 `dist/web/server.js`，临时 Home、随机空闲端口；未碰 4207／4208 和 `~/.molis-work` |
| 次数 | 每页、每种语言各 3 轮，每轮一次冷、一次热，取中位数 |

- **冷**：全新的 Chrome 资料目录，只设语言 Cookie。**热**：同一个 Chrome 里开新标签再开一次，HTTP 缓存还在。
- **字节**：DevTools 的 `encodedDataLength`，含响应头；一次访问里，load 之后、网络静止 1.5 秒（上限 8 秒）之前的请求都算第一屏。
- **压缩**：Host 不压缩。带 `Accept-Encoding: gzip, br` 请求 HTML 和资源，响应都没有 `content-encoding`，所以线上字节就是原始字节。文中的 gzip 列是算出来的对照（`zlib` 第 9 级），不是实际传输。
- **缓存**：HTML 是 `no-store`；`/assets/` 和 `pty-client` 是 `private, max-age=0, must-revalidate` 加 ETag，再次打开每个文件回 304，线上约 326 B。

复现（先 `pnpm build`，`--http-only` 不用排槽位，约 10 秒；全量约 4 分钟）：

```sh
node scripts/machine-slot.mjs run browser --label "first-screen" -- node scripts/first-screen-report.mjs --out <目录>
node scripts/first-screen-report.mjs --summarize <目录>
```

脚本只报告、不判定、不接 CI。第 4 节的节省量是用同一批数据另算的一次性结果，算法写在各小节里。

派活时给的线索，核对结果：CSS 拼接（`page-assets.ts:89,97,102`）、字体路由（`web-assets.ts:83-86`）、缓存头（`:98`）、`--paper:` 每张表 7 处都属实。两处估计偏低或要修正：英文目录不是至少 549 KB，而是 953,817 B（中文作键的部分 589,113 B，接近那个估计）；`VISUAL_FOUNDATION_CLIENT_SCRIPT` 是 77,335 B。另外 7 处 `--paper:` 不是同一张表写 7 遍，七条规则内容各不相同（第 4.1 节）。

## 3. 实测

### 3.1 页面总览

全部实测，线上字节，3 次中位数。「门禁占比」是这次传输里 `page-assets` 量得到的部分。

| 页面 | 语言 | 冷：总传输（请求数） | 门禁占比 | 热：总传输 | 门禁占比 | DCL／FCP／load（冷，毫秒） |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 到达页 `/onboarding` | 中 | 2,921,408（10） | 66.2% | 988,256 | 0.1% | 66／72／70 |
| | 英 | 4,399,587（10） | 44.0% | 2,466,435 | 0.0% | 71／88／75 |
| 项目选择 `/` | 中 | 3,157,053（13） | 61.3% | 1,223,906 | 0.1% | 95／108／101 |
| | 英 | 4,635,419（13） | 41.7% | 2,702,267 | 0.0% | 113／124／118 |
| 工作台·新项目 | 中 | 3,819,824（25） | 58.1% | 1,093,174 | 0.1% | 239／148／252 |
| | 英 | 5,300,012（25） | 41.9% | 2,573,362 | 0.1% | 221／136／233 |
| 工作台·全部项目插件 | 中 | 3,959,380（25） | 56.0% | 1,232,730 | 0.1% | 272／200／285 |
| | 英 | 5,441,522（25） | 40.8% | 2,714,872 | 0.0% | 348／248／362 |
| 工作台·示例项目（带数据） | 中 | 4,653,995（29） | 47.7% | 1,927,345 | 0.1% | 349／232／372 |
| | 英 | 6,139,518（29） | 36.1% | 3,412,868 | 0.0% | 354／240／374 |
| 设置 `/settings/appearance` | 中 | 4,654,950（30） | 47.7% | 1,929,255 | 0.1% | 382／256／407 |
| | 英 | 6,140,473（30） | 36.1% | 3,414,778 | 0.0% | 389／248／414 |
| 组件板 `/__ui/catalog` | 中 | 1,744,681（16） | 46.5% | 934,431 | 0.1% | 216／84／288 |
| | 英 | 1,745,262（16） | 46.4% | 935,008 | 0.1% | 234／88／311 |

注：

- **设置页实际是工作台。** 在浏览器里打开 `/settings/appearance` 会 302 到 `/projects/<id>/?settingsPath=…`（`web-settings-arrival.ts`），这里落到示例项目，所以数字和示例项目工作台接近。独立的设置文档（中文 607,574 B、英文 1,346,771 B，内联 `SETTINGS_CLIENT_SCRIPT` 250,378 B 和 `VISUAL_FOUNDATION_CLIENT_SCRIPT` 77,335 B）只在非页面请求时才返回，第一屏不加载，它的数字见附录 A。
- **组件板的英文页几乎没有语言差别**：它不带语言目录，中英文差约 600 B。
- FCP 中英文差几十毫秒以内，和负载噪声分不开，目前看不出语言目录对时间的影响；这是 M5 Pro 上的结果，慢机器没量。

### 3.2 按种类

冷缓存，线上字节／请求数。热缓存时 CSS、JS、字体都降到每个文件约 320 B，HTML 和 API 不变。

| 页面 | 语言 | HTML | CSS | JS | 字体 | API |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 到达页 | 中 | 985,069／2 | 1,745,326／2 | 188,790／1 | 0 | 2,223／5 |
| | 英 | 2,463,248／2 | 同上 | 同上 | 0 | 2,223／5 |
| 项目选择 | 中 | 1,203,965／2 | 1,745,326／2 | 188,790／1 | 0 | 18,972／8 |
| | 英 | 2,682,314／2 | 同上 | 同上 | 0 | 18,989／8 |
| 工作台·新项目 | 中 | 1,084,877／2 | 1,109,328／2 | 1,619,264／4 | 0 | 6,355／17 |
| | 英 | 2,565,065／2 | 同上 | 同上 | 0 | 6,355／17 |
| 工作台·全部项目插件 | 中 | 1,223,857／2 | 1,109,328／2 | 1,619,264／4 | 0 | 6,931／17 |
| | 英 | 2,705,999／2 | 同上 | 同上 | 0 | 6,931／17 |
| 工作台·示例项目 | 中 | 1,677,528／2 | 1,109,328／2 | 1,619,264／4 | 0 | 247,875／21 |
| | 英 | 3,161,692／2 | 同上 | 同上 | 0 | 249,234／21 |
| 组件板 | 中 | 933,774／1 | 761,987／1 | 0 | 48,625／1（Inter） | 0 |
| | 英 | 934,351／1 | 同上 | 0 | 同上 | 0 |

### 3.3 为什么每页有两份 HTML

到达页、项目选择和工作台载入后，都会在后台再开一份侧栏的「问题收集」文档（`/plugins/issues?side=capture` 或 `/projects/<id>/side/issues/capture`）。它是完整的 HTML：中文 492,614 B，英文 1,231,934 B，也带完整语言目录，`no-store`。到达页和项目选择本来只用到达样式表，因为它又多下载一份工作台样式表（1,109,009 B）和 `plugin-frame.js`（188,790 B）。

load 之前的传输（不含这个文档和其他载入后的请求）是这样的：到达页中文冷 1,129,106 B，比全部的 2,921,408 B 少 61%。这不属于字体皮肤语言，只记下数字，建议单独登待办（第 7 节）。

### 3.4 语言相关字节

| 项 | 条数 | 原始 | gzip |
| --- | ---: | ---: | ---: |
| 中文页目录 `MOLIS_WORK_MESSAGES` | 3,687 | 214,759 | 62,445 |
| 英文页目录 `MOLIS_WORK_MESSAGES` | 11,558 | 815,260 | 265,106 |
| 其中中文原文作键（工作台） | 7,871 | 589,113 | 205,652 |
| 其中稳定键（插件） | 3,687 | 226,148 | 59,865 |
| 英文页插件词 `MOLIS_WORK_PLUGIN_WORDS` | 20 个插件 | 138,557 | 49,886 |
| 中文页插件词 | 0 | 2 | 22 |
| 插件标题 `MOLIS_WORK_PLUGIN_TITLES` | 23 | 中 440／英 430 | 316／253 |
| **英文一份合计（目录＋插件词）** | | **953,817** | 314,608 |

第一屏实际读了多少（主文档，用 Proxy 记录对目录的读取）：

| 页面 | 中文读取 | 英文读取 | 英文读到的字节 | 这些条来自几个现有词典 |
| --- | ---: | ---: | ---: | ---: |
| 到达页 | 0 | 23 | 1,609 | 6 |
| 项目选择 | 0 | 43 | 2,328 | 8 |
| 工作台·新项目 | 0 | 97 | 5,830 | 13 |
| 工作台·全部项目插件 | 0 | 110 | 6,805 | 14 |
| 工作台·示例项目 | 0 | 116 | 6,811 | 14 |
| 设置 | 0 | 118 | 6,848 | 14 |

读到的全是工作台自己的词，没有插件稳定键。局限：只记主文档，不含侧栏文档和插件内容里的 `MOLIS_WORK_PLUGIN_WORDS`；服务端渲染进 HTML 的文字本来就不走这里；打开别的界面后读得更多。

### 3.5 启动 JSON

新项目 17 个请求共 6,355 B，全是很小的响应。数据一多就变：示例项目 21 个请求共 247,875 B，其中 `/api/board/refresh` 一个就 232,084 B；HTML 里的 `molis-work-data` 也从 521 B 涨到 61,116 B，插件内容文档从 149,168 B 涨到 407,699 B。所以**启动数据随项目增长，预算不能只看空项目**。项目选择里 `/api/projects/<id>/brief` 是 16,547 B。

逐请求见附录 B。`/api/home/events`（示例项目两次共 8,580 B）和 `/api/placement/related` 第一屏都请求了两次。

### 3.6 字体

| 字体 | 文件字节 | 这次第一屏下载了吗 |
| --- | ---: | --- |
| Inter Variable | 48,256 | 只有组件板下载（线上 48,625 B，再次打开 338 B） |
| Noto Sans SC Regular | 1,141,536 | 没有，所有页面都没有 |

两款都是带 `unicode-range` 的后备字体，只有当字形落到它们时才下载。本机 PingFang 够用，所以这里是 0。没有中文系统字体的机器（常见于 Linux）第一屏会多 1,141,536 B，这条**没有量到**。

## 4. 可省的字节（全部实算）

用当前构建的真实响应算，未改代码、未在浏览器里验证替换后的效果。

### 4.1 令牌表去重

每张样式表有 7 条写 `--paper:` 的顶层规则，共 20,295 B：4 条浅色、3 条深色，内容各不相同，因为分属不同的层，且选择器逐层变宽。

算法：每组以最后一条规则为准，它的选择器覆盖前面所有规则、优先级相同且顺序靠后，所以前面规则里同名的声明不起作用，可以删掉；不同名的保留。这样删掉 358 条声明，保留 28 条。

| 样式表 | 现在 | 去重后少 | 删 tray／pill 少 | 两项合计少 | 两项之后 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 工作台 | 1,108,657（gzip 157,079） | 10,851（gzip 3,216） | 6,592（gzip 1,073） | 17,443（gzip 4,285） | 1,091,214（gzip 152,794） |
| 设置 | 761,636（gzip 106,251） | 10,851（gzip 3,223） | 6,592（gzip 1,084） | 17,443（gzip 4,307） | 744,193（gzip 101,944） |
| 到达 | 635,966（gzip 88,328） | 10,851（gzip 2,142） | 6,592（gzip 1,055） | 17,443（gzip 3,200） | 618,523（gzip 85,128） |

- tray／pill 只算 `SKIN_STYLES` 本身。`toast.ts` 还有一条相关规则，主题引导脚本和组件板标本里也有相关代码，都没计入，所以实际还能略多一点。
- 这些节省**只在第一次打开时有**：工作台页少 17,443 B，到达页和项目选择因为加载两张表少 34,886 B。再次打开是 304，省 0 B。

### 4.2 把语言目录挪出 HTML

文件都带 ETag，再次打开只回 304（线上 326 B）。下面用实测中位数减去两份内联目录，再加文件本身和响应头（358 B）。三种分法：

- **甲，每种语言一个文件**：英文 953,817 B，中文 214,759 B。
- **乙，工作台一份、插件按需（推荐）**：英文第一屏只加载工作台的 589,113 B，中文第一屏不加载任何文件；插件的词在打开它时再取。
- **丙，严格按现有词典文件拆**：工作台第一屏读到的 97～118 条散落在 13～14 个词典里，要发 13～14 个请求、下载约 46～48 万字节，比乙少下载一些，但请求多得多。

| 页面 | 语言 | 今天：冷／热 | 甲：冷／热 | 乙：冷／热 | 丙：冷／热 |
| --- | --- | --- | --- | --- | --- |
| 到达页 | 中 | 2,921,408／988,256 | 2,707,337／559,394 | **2,491,894／558,742** | 同乙 |
| | 英 | 4,399,587／2,466,435 | 3,446,462／559,461 | **3,081,758／559,461** | 2,822,905／562,721 |
| 项目选择 | 中 | 3,157,053／1,223,906 | 2,942,982／795,044 | **2,727,539／794,392** | 同乙 |
| | 英 | 4,635,419／2,702,267 | 3,682,294／795,293 | **3,317,590／795,293** | 3,160,372／799,857 |
| 工作台·新项目 | 中 | 3,819,824／1,093,174 | 3,605,753／664,312 | **3,390,310／663,660** | 同乙 |
| | 英 | 5,300,012／2,573,362 | 4,346,887／666,388 | **3,982,183／666,388** | 3,863,250／674,212 |
| 工作台·全部项目插件 | 中 | 3,959,380／1,232,730 | 3,745,309／803,868 | **3,529,866／803,216** | 同乙 |
| | 英 | 5,441,522／2,714,872 | 4,488,397／807,898 | **4,123,693／807,898** | 4,020,584／816,374 |
| 工作台·示例项目 | 中 | 4,653,995／1,927,345 | 4,439,924／1,498,483 | **4,224,481／1,497,831** | 同乙 |
| | 英 | 6,139,518／3,412,868 | 5,186,393／1,505,894 | **4,821,689／1,505,894** | 4,718,580／1,514,370 |

- 再次打开，中文每次少 429,514 B，英文每次少约 1,906,974 B。
- 字节和第一屏要读的内容不是一回事：英文第一屏只读约 7 KB，却要下载 589 KB。工作台的词典今后要按界面拆细，但现有词典是按历史来分的，直接拆（丙）只换来 13～14 个请求，不划算。真正的细拆要等第 C 段转稳定键时做。
- 按主人拆的完整文件表：英文 21 个插件共 364,220 B（gzip 120,987），最大的是 `coding` 111,992、`goals` 63,892、`git` 25,224、`shelf` 23,133、`alchemist` 18,158；中文 19 个共 214,777 B（gzip 72,124）。这是今天中文作键的形状，转稳定键后字节会变。
- 这个算法假定 `L()` 仍能同步取到词。第一屏若用 `<script src>` 阻塞加载，热缓存时多一次 304 往返；如果改异步，首屏文字的绑定要先落地（实施方案里已有 TextRef 的安排）。时间影响没有量。

## 5. 未计量入口清单

门禁只量 `/assets/` 字面路由和内置包（`scripts/gates/page-assets-measure.mjs:51,92-96`）。逐入口：

| 入口 | 例子（实测） | 门禁量不量 |
| --- | --- | --- |
| `/assets/` 字面路由和内置插件包 | 51 个文件，6,736,085 B | **量**（只用默认语言，今天中英文字节相同） |
| HTML 文档本身（含服务端渲染的标记） | 工作台 591,250 B，其中标记 206,235 B | 不量 |
| 隐藏的侧栏文档 | 中 492,614 B，英 1,231,934 B | 不量 |
| 内联语言目录（`i18n.ts:154`） | 中 214,759 B，英 953,817 B，每文档一份 | 不量 |
| 内联页面脚本（`arrival/chooser.ts:131`、设置页） | 项目选择 425,937 B，到达页 230,692 B | 不量 |
| 组件板内联脚本和样式 | 356,909 B，17 块 | 不量 |
| 插件内容文档（`plugin-frame.ts:25`） | 新项目 149,168 B，示例项目 407,699 B | 不量 |
| 目录和数据块（`plugin-directory.ts:127`、`molis-work-data`） | 1,289 B；521～61,116 B | 不量 |
| 主题引导块（`preferences.ts:13`） | 6,519～8,069 B（常量本身 1,705 B） | 不量 |
| 内联样式块 | 4,456～9,701 B | 不量 |
| `/desktop/pty-client.js` | 509,323 B，工作台每次第一屏都载入 | 不量（路径不在 `/assets/`） |
| `/api/*` 启动响应 | 6,355～249,234 B | 不量 |
| 英文变体 | 今天差异全在 HTML 里，所以目前只是间接漏掉；**今后的按语言文件会直接漏掉** | 不量 |
| 外部安装的插件包 | 未量 | 不量 |
| 胶囊窗口内联（`capsule-shell.ts:611`） | 未量（桌面端专用） | 不量 |
| 用户导入的字体 | 第 16 批之后才有 | 不量 |

**字节往哪搬，门禁都看不到的地方就在这张表里。** 把 CSS 内联进 HTML、把词典塞进 `/api/bootstrap`、开一条 `/fonts/…` 路由，今天都不会被拦下。反过来，把语言目录挪到 `/assets/` 反而算「新增资源」，要用户批准：现在的门禁奖励方向是反的。

## 6. 统一资源登记

### 6.1 字段

一张表，一个资源一行，由人写进登记、字节和路径由工具核对。

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定身份，如 `font.inter-latin-variable` |
| `kind` | `font`／`skin`／`font-scheme`／`locale`／`interface-spec`／`style`／`script`／`inline`／`startup-json` |
| `owner` | 主人：Design System、Workbench、某个插件 id |
| `path` | 线上路径或路由；内联块写所在文档和块名 |
| `source` | 仓库里的来源文件，或生成它的函数 |
| `bytes` | 原始字节 |
| `gzip` | gzip 对照（Host 不压缩时只作参考） |
| `license` | 许可证，第三方资源必填 |
| `origin` | 来源地址和版权行，第三方资源必填 |
| `load` | 加载时机：`first-screen`（第一屏必载）／`fallback`（缺字形才下载）／`on-open`（打开某界面时）／`on-select`（只在选用时） |
| `gated` | 门禁量不量：`assets`／`first-screen-total`／`no`，`no` 必须写理由 |

这份和「14｜合同台」的资源引用形状对应，字段名以合同定稿为准，本文不定义合同。

### 6.2 A 段第一版

字节里「实测」直接来自构建或文件；「估算」是用今天的真实值写成方案形状后算的，合同定了要重算。

| id | kind | owner | path | 字节 | gzip | 依据 | license／origin | load | gated |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| `font.inter-latin-variable` | font | Design System | `/assets/inter-latin-variable.woff2` | 48,256 | 48,249 | 实测 | OFL 1.1；fontsource，The Inter Project Authors | `fallback` | `assets` |
| `font.noto-sans-sc-400` | font | Design System | `/assets/noto-sans-sc-400.woff2` | 1,141,536 | 1,141,904 | 实测 | OFL 1.1；fontsource，The Noto Project Authors | `fallback` | `assets` |
| `font.rounded-latin` | font | Design System | 待定 | 待下载实测 | 待下载实测 | 候选如 Nunito，未下载 | 待核 | `on-select` | `first-screen-total` 之外，单列 |
| `font.rounded-cjk` | font | Design System | 待定 | 待下载实测 | 待下载实测 | 候选如 Resource Han Rounded，未下载 | 待核 | `on-select` | 同上 |
| `skin.soft-workbench` | skin | Design System | `resources/skins/soft-workbench.json` | 约 9,059（压缩写法）／11,368（缩进） | 约 2,266 | 估算：127 个浅色、127 个深色、31 个形状令牌 | 自有 | Host 读，首屏不直接发给浏览器（待合同定） | 待定 |
| `skin.folio` | skin | Design System | `resources/skins/folio.json` | 约 9,000（同形状类比） | 约 2,300 | 粗估，第 16 批才有 | 自有 | `on-select` | 待定 |
| `font-scheme.system` | font-scheme | Design System | `resources/fonts/system.json` | 约 1,000 | 未算 | 粗估，字族表 362 B 加角色 | 自有 | Host 读 | 待定 |
| `interface-spec` | interface-spec | Design System | `resources/interface.json` | 未估 | 未估 | 组件数待合同定 | 自有 | Host 读 | 待定 |
| `locale.workbench.en` | locale | Workbench | 待定 | 589,113 | 205,652 | 实算（今天中文作键的形状） | 自有 | `first-screen` | `first-screen-total` |
| `locale.workbench.zh` | locale | Workbench | 无（中文原文作键，不用文件） | 0 | 0 | 实测第一屏读 0 条 | 自有 | 转稳定键后才有 | 待定 |
| `locale.<插件>.en` | locale | 各插件 | 待定 | 合计 364,220，21 个 | 120,987 | 实算 | 自有 | `on-open` | `assets` |
| `locale.<插件>.zh` | locale | 各插件 | 待定 | 合计 214,777，19 个 | 72,124 | 实算 | 自有 | `on-open` | `assets` |

`npm` 或安装包里的 JSON 不等于线上字节：皮肤文件由 Host 读后编译成 CSS，浏览器看到的是样式表和展示快照。所以登记里 `path` 和线上字节要分开核对。

## 7. 预算规则方案

**只提方案，改门禁是红线，由主会话问用户。** 三个方案都回答同一个问题：怎样不把字节搬到未计量入口。

### 方案一：只加登记表和内联块门槛

静态扫描：每个资源路由都要在登记里；文档模板里的内联块超过门槛（比如 4 KB）要登记；字节不许超过登记值。

- **好处**：几乎不增加门禁时间，不需要起 Host。
- **代价**：HTML 真实字节、数据块、`/api` 量不到；靠读源码找入口，换个写法就漏，和现在量 `/assets/` 字面路由是同一类弱点。
- **搬字节**：只能拦住已知写法。

### 方案二：真实 Host 上算首屏总账，加登记表（推荐）

门禁用固定种子起一个临时 Home 的真实 Host，不开浏览器，按页面和语言量（`--http-only` 今天约 10 秒，不含启动数据），对照 merge-base：

- **按页面、按语言的总账，不按资源**：`冷总账 = 所有文档 + 第一屏静态文件 + 启动 JSON`；`热总账 = 所有文档 + 启动 JSON + 每个文件 326 B`。字节从一个入口搬到另一个，总账不变；搬到不缓存的入口，热总账变大，直接被拦。
- **挪到可缓存的文件算好事**：语言目录挪出 HTML，冷总账基本不变、热总账大降，不再需要「新增资源」的单独批准，只要登记。
- **规则同现在**：只许变小，增长走 `tooling/gates/page-asset-allowances/` 的许可和用户批准；门槛从「每个资源 10 KB」改成「每页总账 10 KB」。
- **防漏**：第一屏响应的路径和内联块不在登记里就失败；隐藏的文档和启动 JSON 要写进登记，否则不开浏览器看不到。脚本 `first-screen-report.mjs` 定期跑一次浏览器版，核对登记有没有漏项。
- **代价**：门禁要起 Host（约多 10 秒），要加一份固定种子；种子数据一改，数字就变，要过许可；不开浏览器看不到脚本才发的请求，这部分靠登记和定期报告兜底；示例数据不代表真实大项目。要改 `page-assets` 门禁，须用户同意。

**上限怎样定（第一版建议，均为估算）**：以「方案乙落地、删 tray／pill、令牌去重」之后的值为起点，取整后作为上限，防止许可一点点累积。

| 页面 | 冷总账上限 | 热总账上限 |
| --- | ---: | ---: |
| 到达页（中／英） | 2.5 MB／3.1 MB | 0.56 MB |
| 项目选择（中／英） | 2.7 MB／3.3 MB | 0.80 MB |
| 工作台·新项目（中／英） | 3.4 MB／4.0 MB | 0.67 MB |

带数据的示例项目只报告、不设上限，因为它随数据增长，要靠别的办法管（比如 `/api/board/refresh` 是否该首屏就发 232 KB）。隐藏文档和 `pty-client` 改成按需之后，上限应一起下调，不留余量。

**只在选用时加载的字体怎样算**：

- 不进默认皮肤的首屏总账，单列一本「选用总账」：`选用总账 = 默认冷总账 + 该方案的字体字节 + 皮肤差异`。每款字体一个上限，等圆润字体实测后定。
- 门禁或定期报告核对：**没选这个方案时，首屏一个字节都不能下载它**，`@font-face` 声明也不能进基础样式表，要在方案自己的样式里。
- 中文字体建议按 `unicode-range` 分片，选用后也只下载用到的片；现有的 Noto 单文件 1.14 MB 不要照抄。字节要待下载实测。
- `fallback` 字体第一屏可能下载，单列「缺系统字体」的账：今天是默认冷总账 + 1,141,536 B。

### 方案三：真实浏览器总账进 CI

CI 里开浏览器，每页每语言走一遍，所有请求都算。

- **好处**：最准，脚本发的请求、隐藏文档、实际下载的字体都量得到；Linux 上没有中文系统字体，正好能测到后备字体。
- **代价**：7 页、2 种语言，本机 3 轮约 3.5 分钟，单轮一分多钟；浏览器是 CI 里最不稳定、预算最紧的部分（浏览器冒烟只留 3 到 5 个）；时序会带来字节抖动（设置页冷热两次的 API 请求数就差一个），得加容差，容差又是可以钻的空子。
- **搬字节**：拦得最彻底。

### 推荐

**方案二。** 它是能真正回答「别搬字节」的最便宜做法：总账不管字节在哪，也把现在反过来的奖励方向掰正。方案一拦不住 HTML 和 `/api`，方案三成本和抖动都不值。浏览器版（方案三的量法）不进门禁，留作报告，改大的时候手动跑。

**不论选哪个，时间都不进门禁。** 时间随机器负载变化，只在报告里看。

## 8. 要用户定的事，和建议另登的待办

要定（由主会话问）：

1. 选哪个预算方案；选方案二就要改 `page-assets` 门禁。
2. 第 4.2 节挪目录的分法（推荐乙）。在选好的预算规则落地之前挪，按现行规则算「新增资源且涨超 10 KB」，要用户批准。
3. 圆润字体的下载和实测（新增字体同样要批准）。
4. 第 7 节上限的具体数字。

建议另登待办，不属于本批范围：

- 隐藏的侧栏问题收集文档第一屏就加载：到达页中文冷传输里 1,790,413 B（文档＋工作台样式表＋ `plugin-frame.js`），英文再加约 74 万。
- `pty-client.js` 509,323 B，工作台每次第一屏都载入，不管用不用终端；又在门禁视野外。
- 工作台 HTML 把所有已启用插件的内容文档内联（新项目 14 块 149,168 B），包括没打开的。
- `/api/home/events`、`/api/placement/related` 第一屏重复请求。
- `/api/board/refresh` 第一屏 232 KB。

## 9. 没量到的

| 项 | 原因 |
| --- | --- |
| Windows、Linux、缺中文系统字体时的字体下载和时间 | 只有这台 Mac，没有另装环境 |
| 慢机器、真实网络下的时间 | 本机回环且负载高，时间只作相对参考 |
| 桌面壳（Tauri）里的第一屏与胶囊窗口 | 走 Chrome，未起桌面端 |
| 真实大项目 | 真实 Home 是红线；最大的只有示例项目 |
| 外部安装插件的包 | 没有安装外部插件 |
| 无项目 Home 下，浏览器里的设置页 | 种子里已有项目，会跳到工作台；空 Home 的 `/settings` 只用 HTTP 看过跳转 |
| 侧栏文档和插件内容对目录的读取 | 只记录主文档的 `MOLIS_WORK_MESSAGES` |
| 圆润字体 | 按要求未下载 |
| 深色、窄屏 | 字节不受影响，未单独量 |
| 第 4 节替换之后的真实表现 | 只是算出来的；令牌去重未在浏览器里逐像素比对 |

## 附录

### 附录 A　逐页内联块（实测，中文页；英文页只有语言块不同）

**到达页 `/onboarding`**：HTML 491,897（gzip 141,966）；英文 1,231,024（gzip 393,619）；内联合计 456,982／1,196,028；非内联的标记 34,915／34,996。

| 内联块 | 中文原始 | 中文 gzip | 英文原始 |
| --- | ---: | ---: | ---: |
| i18n 块：`MOLIS_WORK_MESSAGES`（3687 条，英文 11558） | 214,759 | 62,037 | 815,260 |
| i18n 块：`MOLIS_WORK_PLUGIN_TITLES`（23 条，英文 23） | 440 | 316 | 430 |
| i18n 块：`MOLIS_WORK_PLUGIN_WORDS`（0 条，英文 20） | 2 | 22 | 138,557 |
| i18n 块里的页面脚本 | 230,692 | 67,969 | 230,692 |
| theme bootstrap | 6,519 | 2,147 | 同左 |
| `<style>` | 4,456 | 1,266 | 同左 |

**项目选择 `/`**：HTML 710,654（gzip 203,107）；英文 1,449,956（gzip 454,757）；内联合计 652,475／1,391,523；非内联的标记 58,179／58,433。

| 内联块 | 中文原始 | 中文 gzip | 英文原始 |
| --- | ---: | ---: | ---: |
| i18n 块：`MOLIS_WORK_MESSAGES`（3687 条，英文 11558） | 214,759 | 62,037 | 815,260 |
| i18n 块：`MOLIS_WORK_PLUGIN_TITLES`（23 条，英文 23） | 440 | 316 | 430 |
| i18n 块：`MOLIS_WORK_PLUGIN_WORDS`（0 条，英文 20） | 2 | 22 | 138,557 |
| i18n 块里的页面脚本 | 425,937 | 124,849 | 425,937 |
| theme bootstrap | 6,519 | 2,139 | 同左 |
| `<style>` | 4,456 | 1,266 | 同左 |
| JSON id="arrival-data" | 248 | 220 | 同左 |

**工作台·新项目**：HTML 591,250（gzip 126,156）；英文 1,332,386（gzip 376,403）；内联合计 385,015／1,124,736；非内联的标记 206,235／207,650。

| 内联块 | 中文原始 | 中文 gzip | 英文原始 |
| --- | ---: | ---: | ---: |
| i18n 块：`MOLIS_WORK_MESSAGES`（3687 条，英文 11558） | 214,759 | 62,445 | 815,260 |
| i18n 块：`MOLIS_WORK_PLUGIN_TITLES`（23 条，英文 23） | 440 | 316 | 430 |
| i18n 块：`MOLIS_WORK_PLUGIN_WORDS`（0 条，英文 20） | 2 | 22 | 138,557 |
| i18n 块里的页面脚本 | 952 | 464 | 952 |
| `<style>` | 9,701 | 2,335 | 同左 |
| theme bootstrap | 8,069 | 2,827 | 同左 |
| JSON data-plugin-directory | 1,289 | 295 | 同左 |
| JSON id="molis-work-data" | 521 | 346 | 同左 |
| 插件内容文档 14 块合计：jelly 35,789、pages 16,276、todo 14,520、ppt 12,554、images 10,447、form 10,080、lingguang 9,633、dataset 8,749、schedule 7,324、issues 6,163、cognia 6,069、alchemist 5,051、plugin-builder 4,120、workflows 2,393 | 149,168 | 29,846 | 149,843 |

**工作台·全部项目插件**：HTML 730,230（gzip 148,632）；英文 1,473,320（gzip 398,191）；内联合计 497,725／1,239,018；非内联的标记 232,505／234,302。

| 内联块 | 中文原始 | 中文 gzip | 英文原始 |
| --- | ---: | ---: | ---: |
| i18n 块：`MOLIS_WORK_MESSAGES`（3687 条，英文 11558） | 214,759 | 62,665 | 815,260 |
| i18n 块：`MOLIS_WORK_PLUGIN_TITLES`（23 条，英文 23） | 440 | 316 | 430 |
| i18n 块：`MOLIS_WORK_PLUGIN_WORDS`（0 条，英文 20） | 2 | 22 | 138,557 |
| i18n 块里的页面脚本 | 952 | 464 | 952 |
| `<style>` | 9,701 | 2,335 | 同左 |
| theme bootstrap | 8,069 | 2,823 | 同左 |
| JSON data-plugin-directory | 1,289 | 294 | 同左 |
| JSON id="molis-work-data" | 908 | 451 | 同左 |
| 插件内容文档 23 块合计：coding 60,416、jelly 35,789、feed 28,223、pages 16,276、todo 14,520、ppt 12,554、images 10,447、form 10,080、lingguang 9,633、git 8,909、dataset 8,749、schedule 7,324、issues 6,163、cognia 6,069、alchemist 5,051、inbox 4,870、files 4,591、plugin-builder 4,120、? 2,675、workflows 2,393、text-stats 994、diff 976、sources 669 | 261,491 | 53,038 | 263,738 |

**工作台·示例项目（带数据）**：HTML 1,184,086（gzip 185,567）；英文 1,929,199（gzip 435,441）；内联合计 704,115／1,446,351；非内联的标记 479,971／482,848。

| 内联块 | 中文原始 | 中文 gzip | 英文原始 |
| --- | ---: | ---: | ---: |
| i18n 块：`MOLIS_WORK_MESSAGES`（3687 条，英文 11558） | 214,759 | 62,665 | 815,260 |
| i18n 块：`MOLIS_WORK_PLUGIN_TITLES`（23 条，英文 23） | 440 | 316 | 430 |
| i18n 块：`MOLIS_WORK_PLUGIN_WORDS`（0 条，英文 20） | 2 | 22 | 138,557 |
| i18n 块里的页面脚本 | 952 | 464 | 952 |
| JSON id="molis-work-data" | 61,116 | 4,779 | 同左 |
| `<style>` | 9,701 | 2,335 | 同左 |
| theme bootstrap | 8,043 | 2,792 | 同左 |
| JSON data-plugin-directory | 1,289 | 294 | 同左 |
| 插件内容文档 19 块合计：feed 120,258、coding 60,338、sources 42,231、jelly 35,789、inbox 29,147、pages 16,276、todo 14,520、ppt 12,554、images 10,447、form 10,080、lingguang 9,633、dataset 8,749、schedule 7,298、? 6,583、issues 6,163、cognia 6,069、alchemist 5,051、plugin-builder 4,120、workflows 2,393 | 407,699 | 61,984 | 410,889 |

**设置（独立文档，见 §3.1 注）**：HTML 607,574（gzip 171,124）；英文 1,346,771（gzip 422,843）；内联合计 572,721／1,311,767；非内联的标记 34,853／35,004。

| 内联块 | 中文原始 | 中文 gzip | 英文原始 |
| --- | ---: | ---: | ---: |
| i18n 块：`MOLIS_WORK_MESSAGES`（3687 条，英文 11558） | 214,759 | 62,665 | 815,260 |
| i18n 块：`MOLIS_WORK_PLUGIN_TITLES`（23 条，英文 23） | 440 | 316 | 430 |
| i18n 块：`MOLIS_WORK_PLUGIN_WORDS`（0 条，英文 20） | 2 | 22 | 138,557 |
| i18n 块里的页面脚本 | 350,887 | 97,798 | 350,887 |
| theme bootstrap | 6,519 | 2,139 | 同左 |

**组件板 `/__ui/catalog`**：HTML 933,216（gzip 172,795）；英文 933,793（gzip 172,510）；内联合计 356,909／356,909；非内联的标记 576,307／576,884。

| 内联块 | 中文原始 | 中文 gzip | 英文原始 |
| --- | ---: | ---: | ---: |
| script | 101,420 | 25,850 | 同左 |
| script | 77,335 | 22,581 | 同左 |
| script | 24,470 | 6,794 | 同左 |
| `<style>` | 22,347 | 4,485 | 同左 |
| script | 21,407 | 7,820 | 同左 |
| `<style>` | 19,781 | 4,357 | 同左 |
| script | 18,942 | 6,639 | 同左 |
| `<style>` | 18,883 | 4,138 | 同左 |
| script | 17,227 | 6,109 | 同左 |
| `<style>` | 14,516 | 3,667 | 同左 |
| script | 8,968 | 3,052 | 同左 |
| `<style>` | 3,974 | 1,264 | 同左 |
| `<style>` | 3,431 | 1,184 | 同左 |
| theme bootstrap | 1,705 | 526 | 同左 |
| `<style>` | 1,320 | 447 | 同左 |
| script | 753 | 347 | 同左 |
| script | 430 | 297 | 同左 |

### 附录 B　逐页请求（实测，中文页、冷缓存，3 次中位数）

线上字节含响应头。「门禁」列：是＝`page-assets` 量这个路径。英文页除两份 HTML 外其余相同（API 差几百字节）。「载入后」＝load 事件之后才发出。

**到达页 `/onboarding`**

| 种类 | 路径 | 次数 | 线上字节 | 门禁 | 时机 |
| --- | --- | ---: | ---: | --- | --- |
| css | `/assets/molis-work-workbench.css` | 1 | 1,109,009 | 是 | 载入后 |
| css | `/assets/molis-work-arrival.css` | 1 | 636,317 | 是 | 载入前 |
| html | `/plugins/issues?side=capture` | 1 | 492,614 | 否 | 载入后 |
| html | `/onboarding` | 1 | 492,455 | 否 | 载入前 |
| js | `/assets/molis-work-plugin-frame.js` | 1 | 188,790 | 是 | 载入后 |
| api | `/api/onboarding/context` | 2 | 831 | 否 | 载入前 |
| api | `/api/onboarding/context/<id>/selection` | 1 | 754 | 否 | 载入后 |
| api | `/api/host/plugin-pages` | 1 | 364 | 否 | 载入后 |
| api | `/api/plugins/io.molis.work.issues/list` | 1 | 274 | 否 | 载入后 |

**项目选择 `/`**

| 种类 | 路径 | 次数 | 线上字节 | 门禁 | 时机 |
| --- | --- | ---: | ---: | --- | --- |
| css | `/assets/molis-work-workbench.css` | 1 | 1,109,009 | 是 | 载入后 |
| html | `/` | 1 | 711,351 | 否 | 载入前 |
| css | `/assets/molis-work-arrival.css` | 1 | 636,317 | 是 | 载入前 |
| html | `/plugins/issues?side=capture` | 1 | 492,614 | 否 | 载入后 |
| js | `/assets/molis-work-plugin-frame.js` | 1 | 188,790 | 是 | 载入后 |
| api | `/api/projects/<id>/brief` | 1 | 16,547 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/surface-kinds` | 1 | 593 | 否 | 载入前 |
| api | `/api/host/plugin-pages` | 1 | 364 | 否 | 载入后 |
| api | `/api/personal/status` | 1 | 356 | 否 | 载入前 |
| api | `/projects/<id>/api/attention?surface=` | 1 | 324 | 否 | 载入前 |
| api | `/api/plugins/io.molis.work.issues/list` | 1 | 274 | 否 | 载入后 |
| api | `/projects/<id>/api/assistant/characters` | 1 | 260 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/works` | 1 | 254 | 否 | 载入前 |

**工作台·新项目**

| 种类 | 路径 | 次数 | 线上字节 | 门禁 | 时机 |
| --- | --- | ---: | ---: | --- | --- |
| css | `/assets/molis-work-workbench.css` | 2 | 1,109,328 | 是 | 载入前 |
| js | `/assets/molis-work-workbench.js` | 1 | 893,496 | 是 | 载入前 |
| html | `/projects/<id>/` | 1 | 591,808 | 否 | 载入前 |
| js | `/desktop/pty-client.js` | 1 | 509,681 | 否 | 载入前 |
| html | `/projects/<id>/side/issues/capture` | 1 | 493,069 | 否 | 载入后 |
| js | `/assets/molis-work-plugin-frame.js` | 1 | 188,790 | 是 | 载入后 |
| js | `/assets/molis-work-knowledge.js` | 1 | 27,297 | 是 | 载入前 |
| api | `/projects/<id>/api/contextual/surfaces` | 1 | 1,134 | 否 | 载入后 |
| api | `/projects/<id>/api/agent/reviews?status=pending` | 1 | 551 | 否 | 载入后 |
| api | `/projects/<id>/api/assistant/surface-kinds` | 1 | 545 | 否 | 载入前 |
| api | `/projects/<id>/api/placement/related?project_id=<id>` | 2 | 508 | 否 | 载入前 |
| api | `/projects/<id>/api/host/plugin-pages` | 1 | 364 | 否 | 载入后 |
| api | `/api/personal/status` | 1 | 356 | 否 | 载入前 |
| api | `/projects/<id>/api/project-settings/runtime` | 1 | 340 | 否 | 载入前 |
| api | `/api/sync` | 1 | 334 | 否 | 载入前 |
| api | `/projects/<id>/api/runtime-availability` | 1 | 330 | 否 | 载入前 |
| api | `/projects/<id>/api/attention?surface=` | 1 | 322 | 否 | 载入前 |
| api | `/projects/<id>/api/plugins/io.molis.work.issues/list` | 1 | 274 | 否 | 载入后 |
| api | `/projects/<id>/api/home/events` | 1 | 268 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/characters` | 1 | 260 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/executors` | 1 | 259 | 否 | 载入前 |
| api | `/projects/<id>/api/plugins/runtime/updates` | 1 | 256 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/works` | 1 | 254 | 否 | 载入前 |

**工作台·全部项目插件**

| 种类 | 路径 | 次数 | 线上字节 | 门禁 | 时机 |
| --- | --- | ---: | ---: | --- | --- |
| css | `/assets/molis-work-workbench.css` | 2 | 1,109,328 | 是 | 载入前 |
| js | `/assets/molis-work-workbench.js` | 1 | 893,496 | 是 | 载入前 |
| html | `/projects/<id>/` | 1 | 730,788 | 否 | 载入前 |
| js | `/desktop/pty-client.js` | 1 | 509,681 | 否 | 载入前 |
| html | `/projects/<id>/side/issues/capture` | 1 | 493,069 | 否 | 载入后 |
| js | `/assets/molis-work-plugin-frame.js` | 1 | 188,790 | 是 | 载入后 |
| js | `/assets/molis-work-knowledge.js` | 1 | 27,297 | 是 | 载入前 |
| api | `/projects/<id>/api/contextual/surfaces` | 1 | 1,269 | 否 | 载入后 |
| api | `/projects/<id>/api/assistant/executors` | 1 | 652 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/surface-kinds` | 1 | 593 | 否 | 载入前 |
| api | `/projects/<id>/api/agent/reviews?status=pending` | 1 | 551 | 否 | 载入后 |
| api | `/projects/<id>/api/placement/related?project_id=<id>` | 2 | 508 | 否 | 载入前 |
| api | `/projects/<id>/api/host/plugin-pages` | 1 | 364 | 否 | 载入后 |
| api | `/api/personal/status` | 1 | 356 | 否 | 载入前 |
| api | `/projects/<id>/api/project-settings/runtime` | 1 | 340 | 否 | 载入前 |
| api | `/api/sync` | 1 | 334 | 否 | 载入前 |
| api | `/projects/<id>/api/runtime-availability` | 1 | 330 | 否 | 载入前 |
| api | `/projects/<id>/api/attention?surface=` | 1 | 322 | 否 | 载入前 |
| api | `/projects/<id>/api/plugins/io.molis.work.issues/list` | 1 | 274 | 否 | 载入后 |
| api | `/projects/<id>/api/home/events` | 1 | 268 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/characters` | 1 | 260 | 否 | 载入前 |
| api | `/projects/<id>/api/plugins/runtime/updates` | 1 | 256 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/works` | 1 | 254 | 否 | 载入前 |

**工作台·示例项目（带数据）**

| 种类 | 路径 | 次数 | 线上字节 | 门禁 | 时机 |
| --- | --- | ---: | ---: | --- | --- |
| html | `/projects/<id>/` | 1 | 1,184,645 | 否 | 载入前 |
| css | `/assets/molis-work-workbench.css` | 2 | 1,109,328 | 是 | 载入前 |
| js | `/assets/molis-work-workbench.js` | 1 | 893,496 | 是 | 载入前 |
| js | `/desktop/pty-client.js` | 1 | 509,681 | 否 | 载入前 |
| html | `/projects/<id>/side/issues/capture` | 1 | 492,883 | 否 | 载入后 |
| api | `/projects/<id>/api/board/refresh?view=current&goal_id=<id>` | 1 | 232,084 | 否 | 载入后 |
| js | `/assets/molis-work-plugin-frame.js` | 1 | 188,790 | 是 | 载入后 |
| js | `/assets/molis-work-knowledge.js` | 1 | 27,297 | 是 | 载入前 |
| api | `/projects/<id>/api/home/events` | 2 | 8,580 | 否 | 载入前 |
| api | `/projects/<id>/api/contextual/surfaces` | 1 | 1,269 | 否 | 载入后 |
| api | `/projects/<id>/api/assistant/executors` | 1 | 652 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/surface-kinds` | 1 | 593 | 否 | 载入前 |
| api | `/projects/<id>/api/agent/reviews?status=pending` | 1 | 551 | 否 | 载入后 |
| api | `/projects/<id>/api/placement/related?project_id=<id>` | 2 | 508 | 否 | 载入前 |
| api | `/projects/<id>/api/host/plugin-pages` | 1 | 364 | 否 | 载入后 |
| api | `/api/personal/status` | 1 | 356 | 否 | 载入前 |
| api | `/projects/<id>/api/project-settings/runtime` | 1 | 340 | 否 | 载入前 |
| api | `/api/sync` | 1 | 334 | 否 | 载入前 |
| api | `/projects/<id>/api/runtime-availability` | 1 | 330 | 否 | 载入前 |
| api | `/projects/<id>/api/attention?surface=` | 1 | 324 | 否 | 载入前 |
| api | `/projects/<id>/api/plugins/io.molis.work.goals/goals/V1/terminals` | 1 | 274 | 否 | 载入后 |
| api | `/projects/<id>/api/plugins/io.molis.work.issues/list` | 1 | 274 | 否 | 载入后 |
| api | `/projects/<id>/api/board/cursor` | 1 | 272 | 否 | 载入后 |
| api | `/projects/<id>/api/assistant/characters` | 1 | 260 | 否 | 载入前 |
| api | `/projects/<id>/api/plugins/runtime/updates` | 1 | 256 | 否 | 载入前 |
| api | `/projects/<id>/api/assistant/works` | 1 | 254 | 否 | 载入前 |

**组件板 `/__ui/catalog`**

| 种类 | 路径 | 次数 | 线上字节 | 门禁 | 时机 |
| --- | --- | ---: | ---: | --- | --- |
| html | `/__ui/catalog` | 1 | 933,774 | 否 | 载入前 |
| css | `/assets/molis-work-settings.css` | 1 | 761,987 | 是 | 载入前 |
| font | `/assets/inter-latin-variable.woff2` | 1 | 48,625 | 是 | 载入后 |
| other | `/favicon.ico` | 1 | 295 | 否 | 载入后 |
