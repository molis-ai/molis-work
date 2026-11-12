# BL-desktop-quit-on-system-logout

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-desktop-quit-on-system-logout | 桌面在 `ExitRequested` 上先拦下、由胶囊问「退出后这些不会运行」；macOS 注销、重启或关机时也会先等这一问，系统会提示应用阻止了注销。系统发起的退出应当不问直接退（宿主照常停，错过的事下次醒来按主人各自记），只在托盘「退出」与 ⌘Q 时问 | [#2034](https://github.com/molis-ai/molis-work/pull/2034) 第 25 批评审 | 已知缺口 | 要先确认 Tauri 能否分辨系统发起的退出（`applicationShouldTerminate` 的来源），本批不改 | 第 25 批常驻运行（#2034）；重看条件：第 26 批做退出与更新体验时一并看 | 中 | F 轨（执行会话待分配） |
