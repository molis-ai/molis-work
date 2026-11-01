# W6 场景6项目签包子链独立二审

**结论：约定的单安装生命周期子链通过，无产品/执行必修。报告有一处必修事实修正，见下文；不需重跑。** 本线只读回核 [驱动](/private/tmp/w6-scene6-execution/chain.mts)、[31行原始结果](/private/tmp/w6-scene6-execution/actions.jsonl)、绑定、进程退出和清理；未运行新测试、构建、浏览器或签包，未写 GitHub/真实 Home。

唯一必修是作者 [REPORT.md](/private/tmp/w6-scene6-execution/REPORT.md) 的保存位置表述：「临时Ed25519私钥和两份签名包仅存在执行进程内存，未保存」不成立。私钥由 `newPublisher()` 在进程内生成，驱动未导出；两份**已签包**在真实 confirm 后经 `PluginInstallService.confirm → SandboxPackageStore.save` 写入隔离 Home 的 `plugin-packages`（bundle、entrypoint），执行后随 Home 删除。原报告改成该准确事实即可；落盘正是真实安装链的一环。

输入为 clean H `469dafa192ac26e7894020958b75f61d20cd2eb2`，tree `80719ba7dc19a4aa7b7b2b09f87229673a539d96`；H 对已采用 M `3fd857792a27352030ac8f3544a3b57d418febc1` 只改 `tests/goals-dialogs.e2e.test.ts`。生产和本链 fixture 等价。槽内重算与 manifest 摘要同为 `c75b962c1bff4d1f6eccdb3e12e3c022e32b2c6e5523b22272f80631d83c11dd`；本线已用只读 fs/crypto 独立复算相同值。[构建绑定](/private/tmp/w6-scene6-execution/binding.json)

执行路径是真实 `installedPackageHost` 的 `MolisWorkLocalHost`、SQLite 项目与公开 `actionClient`：management caller 经 `plugins.install.preview@3 → confirm@1` 验签/固定发布者/保存包，随后由项目安装生命周期和 `sandboxedPluginDefinition` 启动 `/usr/bin/sandbox-exec` runner；普通 notes caller 无管理权限。v1/v2 在签名前修正 add 的 read/write 声明，同一 Ed25519 发布者签名；v2 改实际 entrypoint 并声明兼容1.0.0。驱动未调用 fixture 的空 `service()` 回调，也未直接写 Runtime 内存状态。

原始状态同一 `plugin-install-485a3a15b5af495dca5f370fec49ab65`：初始公开安装/动作目录空；v1 running/pinned 后发现 add/list，add one 返回 true，list 精确 `[1:one]`。disable 后 installed 为 disabled，动作目录撤下，缓存 add 实际抛 `ActionError/actions.missing`；enable 后同 install_id/running，重新发现并读回仍只有 one，证明拒绝未写入。v2 预览确认后仍同 id、版本1.1.0，旧 one 保留；新 add two 使 list 精确出现 `2:v2:two`，证明新代码运行且数据连续。uninstall `keep_data:false` 后安装列表、动作目录皆空；缓存 v2 add/list 均抛 `actions.missing`，Runtime owner 的 `SqlitePluginPrivateStorage.snapshotInstallationData(install_id)` 为空。成功 add/list 及后续读回是拒绝路径的正控，未用空响应或基础设施异常冒充拒绝。目录 raw 中 `{}` 是 undefined 属性的 JSON 表示，驱动断言了两引用均为 undefined。

Node24/darwin 经公共槽运行，`exit.json` 为0，无失败重试。Host `close()` 后本次 Home 已删，外层七个隔离目录也清理；PID78297已退出，当前只读回读同样不存在。[执行环境](/private/tmp/w6-scene6-execution/command.json)、[清理](/private/tmp/w6-scene6-execution/cleanup-readback.json)。HOME/CFFIXED/XDG/Node TMP、file secret backend 与 ad-hoc identity 是本次实际设置；Foundation 原生临时目录仍保留既有局限，不能由这些环境变量声称全系统完全隔离。

旧 T346 两文件各14/14、T122 三文件23/23保持原头与执行者归属。本链证明公开 Host API 的**项目签包**安装、停用、恢复、兼容升级及卸载撤销；未覆盖搜索/MCP/真实助理模型/Memory、Home origins、重启或 UI/本人验收。包本身没有搜索和情境声明，不能替场景6其他分支签结。原场景6及 W6 总体仍待结算。
