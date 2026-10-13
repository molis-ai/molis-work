# Molis Work Computer Helper

个人助理操作 macOS 桌面应用时，真正看屏幕、动鼠标键盘的那个进程（[specs/computer-use](../../../../specs/computer-use/spec.md)）。它不做决定：看哪个应用、做什么由 local-host 的桌面驱动说，Prologue 的策略与用户的批准都在它之前。它只在最后一刻拒绝它看得出不安全的事——落点被别的窗口盖住、焦点在密码框里、用户的手在鼠标键盘上——并报告用户的输入、锁屏与系统权限。

## 形态

- 独立的 `Molis Work Computer Helper.app`（bundle id `com.molis.work.computer-helper`，`LSUIElement`），由 local-host 经 LaunchServices（`open -n -g`）拉起：它自己是负责进程，屏幕录制、辅助功能、输入监控的授权都记在这个名字下，与 local-host 是从桌面应用、LaunchAgent 还是终端起来的无关。
- 与 local-host 之间是 local-host 打开的 Unix 套接字，一行一条 JSON；套接字一断它就退出。
- 要求 macOS 14 及以上。

## 协议

请求 `{"id", "op", "params"}`，回复 `{"id", "ok": true, "result"}` 或 `{"id", "ok": false, "error": {"code", "message"}}`。坐标一律是全局屏幕点（左上为原点，和辅助功能、CGEvent 同一套）。

| op | 做什么 |
| --- | --- |
| `status` | 版本、三项权限、锁屏 / 屏保 / 显示器睡眠 / 是否在控制台、空闲秒数、显示器 |
| `permissions.request` | 弹系统提示并打开系统设置里对应的面板（`accessibility` / `screen_recording` / `input_monitoring`） |
| `apps.running`、`apps.installed` | 正在运行的应用、常见位置里装着的应用（bundle id 与名字） |
| `app.open`、`app.state` | 打开或切到前台；应用当前的窗口、前窗、弹出层 |
| `observe.tree`、`observe.screenshot`、`observe.menus` | 前窗的辅助功能树（密码值不出进程）；只含该应用、密码框涂黑的截图；菜单 |
| `probe.point`、`focused.field`、`document` | 某点最上层的窗口与元素；焦点输入框；前窗的文件 |
| `input.pointer`、`input.hover`、`input.scroll`、`input.drag` | 鼠标；注入前核落点 |
| `input.key`、`input.text`、`input.menu` | 键盘、文字（先经辅助功能插入）、按菜单路径选 |
| `file.give` | 把本机一个文件交给该应用打开 |
| `monitor` | 开关对用户输入的监听 |

事件（无 `id`）：`hello`（带令牌）、`status`（权限或在场状态变了）、`input`（用户的鼠标键盘，助手自己的事件带标记、不报）、`front`、`app_exit`、`watch_failed`。

## 构建与签名

随 local-host 的构建在 macOS 上自动构建（`native/computer/build.mjs`，源码没变就不重签），产物在忽略的 `bin/` 里，随 local-host 包的 `files` 发出，local-host 按包的位置找到它（同 `native/materials`）。单独构建：

```bash
pnpm --filter @molis-ai/molis-work-app-local-host run computer:build
```

macOS 按签名记授权。`MOLIS_HELPER_SIGNING_IDENTITY` 指定证书；不给时用本机的「Tauri Local Development」证书（有就用），否则 ad-hoc 并警告：ad-hoc 每次构建都变，授权会丢。发布签名与公证待定（BL-021，spec D08）。
