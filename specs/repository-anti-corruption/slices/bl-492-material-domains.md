# BL-492：材料读取器可限定在几个精确域名内

状态：已实现，本地分支 `claude/ac-bl492-material-domains`（基于 main `27bb3c212`），已推送、不开 PR；P2c（沙箱经 broker 读公开网页）在它之上，要等它和 #1139 都进 main（2026-10-23）。

## 1. 为什么

PG-017 设计稿（`slices/pg017-sandbox-services.md` §3.4、Q4）：材料服务的 `readSource` 是**宿主替插件去抓网页**。沙箱自己的网络是“精确批准的域名、443、不跟重定向”，如果材料抓取原样开给沙箱，就绕过这道门。所以先给读取器一个“只许这几个主机”的选项，沙箱那一片（P2c）才有东西可接。这一片只做宿主侧的选项，不给沙箱任何新能力。

## 2. 做了什么

| 项 | 做法 |
| --- | --- |
| 读取器 | `fetchMaterialPublicBytes` 的 `allowedHosts`：每个请求（含每一跳重定向）在**查找主机与建立连接之前**，拿 URL 解析后的 `hostname` 与名单逐个比对（精确相等，URL 解析器已转小写），不在名单里答 `material.source.domain_not_allowed`（kind `forbidden`）。重定向目标先经 `materialRedirectTarget` 比对，再递归读取，所以离开名单的跳转既不被查找也不被连接 |
| 来源读取 | `readMaterialSource` 的 `allowed_hosts` 交给它发出的**每一次**读取：页面本身、B 站一类跟去的接口、字幕文件、媒体下载。读取函数拿到的是同一份名单，真正的拒绝在 fetcher 里 |
| 插件客户端 | `createPluginMaterialsClient` 的 `readSource(url, { allowedDomains })`：名单必须是 1～20 个互不相同的小写 DNS 名（至少两段、末段以字母开头），否则 `plugin.materials_domains_invalid`，不到宿主读取器；通过的名单原样经 `PluginMaterialsDispatch.allowedDomains` 交给宿主端口 |
| 合同 | `PluginMaterialSourceRequest` 多一个可选的 `allowedDomains`（新增，已有调用不受影响）；API 快照 `tooling/gates/api/contracts/platform/plugin.txt` 同步 |

## 3. 信任边界（这一片守住什么）

- **默认是关**：名单是一个只会收窄的选项。没有名单就是原来的行为（宿主自己的入口——人粘贴链接导入——读所有公网主机，S-10 的地址表照旧）；给了名单就**只**读名单里的主机，空名单什么都不许（`[]` 在客户端是 `plugin.materials_domains_invalid`，在读取器是 `domain_not_allowed`，两处都不会被当成“没有名单”）。
- **名单从哪来**：这一片里名单只是调用者自己交的收窄，不能放宽任何东西（不给就是原来的，给了只会更少）。**沙箱那一边的名单不由沙箱代码给**：P2c 里 broker 用操作声明、并且人已批准的网络域名（`permit("networkDomains", host)`）算出名单交给宿主端口，沙箱交上来的参数里没有名单这一项；那一片的 S-60 测试断言“没有批准的域名就没有读取”。
- **精确匹配**：不认通配符、不认子域名、不认 IP、不认端口（端口不在名里）、不认末尾的点；`docs.example.com.evil.example`、`evil.example/docs.example.com`、`user.docs.example.com` 都不是 `docs.example.com`。
- **重定向**：每一跳都再比对一次，且在查找之前；超过四跳照旧 `redirect_limit`。
- **地址规则不动**：`isMaterialPublicAddress`（S-10 的地址表）一个字没改。名单比对发生在主机名上、先于查找，和地址规则是两道独立的门，通过名单不等于通过地址规则。

## 4. 验收

| 编号 | 断言 | 测试 |
| --- | --- | --- |
| BL492-01 | 名单外的主机按精确名字拒绝（含看起来像、带用户名、带路径的写法），空名单什么都不许，没有名单不限制 | `tests/jelly-source-providers.test.ts`「BL492-01 a host outside the allowed list is refused」 |
| BL492-02 | 首个请求在查找之前就被拒（连解析不了的名字也是名单的拒绝，不是 DNS 的失败），重定向目标不在名单里同样被拒 | 同上「BL492-02 the first request is refused before any lookup」 |
| BL492-03 | 服务器真的回了跳转：不在名单的主机既没被查找也没被连接，名单内的跳转跟得上，没有名单时同一个跳转会被跟到别的主机（名单才是拒绝的原因） | 同上「BL492-03 a redirect the server answers with」 |
| BL492-04 | 一个来源的读取发出的每个请求（页面、接口、字幕、媒体）都带这份名单，名单外的接口被拒、之后的请求不再发出 | 同上「BL492-04 every request a source's reader makes carries the list」 |
| BL492-05 | 客户端只放行形状对的名单（通配符、IP、端口、末尾的点、空串、非 ASCII、非数组、含非字符串的项、超过 20 项、重复、大写都拒），被拒的名单没有到宿主读取器 | `tests/plugin-materials-allowed-domains.test.ts` |

安全不变量：并进 S-10（读取器是它名下“五处实现”之一，这一片给它加了“名单”这一道门），没有新编号；表里加了上面这几个测试标题。

## 5. 没动

地址规则（S-10 的表）；宿主自己的导入入口；沙箱（P2c）；合同里的其他类型。

## 6. 要统筹定的

- **198.18.0.0/15（代理的 fake-IP 段）**：读取器现在的做法和别处不同——系统解析只回这一段（`proxySynthetic`）时，改问可信 DoH（`dns.google`）拿真实公网地址再校验，S-10 的表里这一段在读取器里仍是“不公开”；插件创作台的联网层则直接放过这一段（用户 2026-09-27 定）。这一片**没有改**读取器的这一行为。要问的是：带名单的读取（批准过域名的）是否也该直接把这一段当正常地址，不再绕 DoH？不改的后果：公司代理要求的 fake-IP 环境里，DoH 不通，带名单的读取就读不了网页（对人的导入现在走的是同一条路径）；改的话要动 S-10 的地址表和它的测试，只限带名单的读取。
