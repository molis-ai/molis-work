# 桌面里的插件界面要能打开

状态：源码候选，待本组合隔离系统 WebKit 与 HTTP 验证。原问题是桌面里的 Pages 停在「无法加载界面，请重试」，同一页在 Chrome 能打开。原作者记过隔离 WebKit 加载「数小智」后 ready，但当前未取得该次原始执行材料，不作为本组合通过。实现与适配负责人：PIPE；独立验证由 Root 统一排槽。真实 Home、真实桌面安装与本人验收另列，不执行真实项目维护。

## 原因

插件界面画在沙箱 iframe 里（srcdoc，没有 allow-same-origin）。这个框会继承父页面的内容安全策略。父页面只写了 `'self'`。WebKit 在这个不透明源里不把 `'self'` 当成 `http://127.0.0.1:<端口>`，框里的脚本和样式被拒绝，父页面大约 10 秒后收起框并显示重试。Chrome 把继承来的 `'self'` 当成父页面的源，所以同一页能开。

## 做法

请求入口在带 `script-src 'self'` 的页面策略上，写上这次请求自己的回环 origin（脚本、样式、图片、字体）。地址判定复用 `contracts/platform/loopback` 的 `isLoopbackHttpOrigin`，只认与解析结果一致的完整 origin，不另写地址名单。父页面能加载的地址没有变宽，`connect-src` 与 `frame-ancestors` 不变。不给 iframe 加 `allow-same-origin`。

## 验收

- FRAME-WEBKIT-01：页面回答的内容安全策略里，`script-src`、`style-src`、`font-src` 带有这次请求自己的 `http://127.0.0.1:<端口>`。测试名或注释写出该编号。
- FRAME-WEBKIT-02：最终合成树正式构建后，在隔离临时 Home、随机回环端口、非持久系统 WKWebView 中打开真实 Pages；产品脚本与 bridge 自己完成 ready，外链样式实际生效，正常系统字体栈与中英文显示正确；实际不透明框中原声明的备用字体通过 `FontFaceSet.load` 产生真实 HTTP 并成功加载，没有 `font-src` 拒绝，不要求 UI 字形改用备用字体。原 10 秒期限后仍没有重试占位。截图、页面/网络与自然退出保留。仅 header、Chrome 或 Native 注入成功不能证明这一项。
- FRAME-WEBKIT-03：同一实际不透明框读 `parent.document` 被拒，不含宿主 token；直接 XHR 到 `/settings` 被 CSP 拒绝且宿主未收到该标记请求，框导航宿主 HTML 被 403 拒绝而父页保留。复用原 S-02/S-21 的 HTTP 拒绝断言，不放宽安全策略。
- 原真实桌面窗口中打开 Pages 的最终体验仍待真实安装及用户验收；隔离系统 WK 只证明所测 WebKit 版本与路径。
