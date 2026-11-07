# BL-seatbelt-dynamic-node

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-seatbelt-dynamic-node | 插件沙箱的 Seatbelt 配置只放行 Node 本体、`/usr/lib` 和 `/System/Library`（`packages/plugin-sandbox/src/seatbelt.ts`）。动态链接 libnode 的 Node 在沙箱里加载不了这个库，dyld 被挡，进程退出 134。本机 Homebrew 24.22.2（`@rpath/libnode.137.dylib`）实测如此。所以这种 Node 上不只是测试受影响，生成插件的后端也起不来 | [#1910](https://github.com/molis-ai/molis-work/pull/1910) 的失败比对（S-102 会话） | 已知缺口 | 查 S-102 时碰到的，不在那片范围。没查发行包带的 Node 是不是动态链接，所以不知道已安装的用户碰不碰得到。`home-release.ts` 的 `copyLoaderLibraries` 已经为这种 Node 拷了库，但沙箱配置没放行拷过去的位置。SQLite 第二步定了开发机不再用 Homebrew 的 Node 跑服务，要等它落地后再判断还用不用改配置 | SQLite 第二步（锁 Node） | 中 | 平台包维护（执行会话待分配） |
