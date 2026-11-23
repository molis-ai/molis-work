# BL-b47-review-followups

分组：7. 平台与架构 / 已装插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b47-review-followups | 第 47 批全 PR 评审的小修（不挡合并）：① 安装单失败时显示宿主给的 `error.message`，宿主文案是中文，英文界面会显示中文（A-1／B-1），改成按错误码取界面文字；② `package-install.ts` 的 `stoppedAt()` 用正则猜错误码属于哪一步，新码会落到「装进」一步（B-2），改成宿主在拒绝里给出步骤；③ 升级时逐项改可选开关失败只记权限名、丢了错误码（B-3）；④ `plugin-page-install-http.ts` 的 `sheets` 是模块级 Map，同进程多 Home 共用 64 个名额（B-4），按 Home 分开；⑤ 生命周期守卫每次保存前多一次 `get`（C-1）、`state_machines.get@1` 先读全部再筛（C-2）；⑥ 已装宿主若是项目里第一个开平台的，平台不带 Agent 观察者开起来（E-1），只留项目监督器一个开启入口；⑦ `tests/installed-plugin-host.test.ts` 的 RAC-1196（只在 macOS 跑，CI 不跑）在 main 5bfd52b87b 上就红：#2248 让恢复时没起来的安装把提示词记成停用，用例仍要「启用」，在 main 的构建上单跑复现，同一断言；改用例还是改行为归 #2248 的技能负责人定 | [#2239 评审](https://github.com/molis-ai/molis-work/pull/2239) | 已知缺口 | 不改行为的小修，评审定为不挡合并 | 无 | 低 | 已装插件与安装单的维护人 |
