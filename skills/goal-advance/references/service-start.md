# Starting Molis Work Web from a Runtime

Use this reference only when the user explicitly asks to start or open the Molis Work page/Web UI, or accepts a separate visualization offer. Service management is independent of Goal work; never use these commands to read or modify Goals, project bindings, reports, agreements or decisions.

## 1. Inspect before acting

Run the installed, read-only status command first:

```bash
"$HOME/.molis-work/bin/molis-work" service status --home "$HOME/.molis-work" --json
```

If the launcher does not exist, say Molis Work itself is not installed or is incomplete and point the user to the normal installation flow. Do not silently use a repository checkout, another database, or a different Molis Work home.

## 2. Interpret the user's opening intent once

This route is only for opening the Molis Work page or Web UI. “使用 Molis Work 继续这个项目”, “推进这个 Goal”, “连接项目”, and “打开这个 Goal” are Goal work, not Web startup requests; use the Runtime MCP flow without inspecting or starting Web.

After the read-only status check, preserve the user's actual choice:

- If the user only says “启动 Molis Work” or “打开 Molis Work” and the service is `absent`, offer one real choice between temporary foreground use and login-persistent use: “当前可以本次临时打开（关闭终端或 Session 后停止），也可以启用登录常驻（会安装 Molis Work 管理的用户级 LaunchAgent，关闭终端后仍运行并在登录后启动）。你想选哪一种？” Before the user chooses, do not run either startup path or write system configuration. The user's choice is the authorization for that path; do not ask the same decision again.
- An explicit request for temporary foreground use already authorizes the foreground launcher. Explain that closing the terminal or Runtime Session stops it, then run that path without another “确定吗”.
- An explicit request to enable login persistence already authorizes a first install when the service is `absent`. Explain that Molis Work will install its owned user-level LaunchAgent, keep running after the terminal closes, and start after login; then run the confirmed install without repeating the choice.
- Natural language is sufficient when it clearly identifies the current path. Do not require the user to copy a fixed phrase. “先临时开一下”, “这次随终端关闭”, “启用登录后自动启动”, and equivalent wording carry the same path-specific authority.
- Accepting a contextual visualization offer authorizes opening Web, but does not choose temporary versus persistent lifetime. If the service is `absent`, ask the same single choice above.

## 3. Route the returned service state

Use the returned `state` exactly:

| State | Runtime action |
|---|---|
| `running` | Do not restart. Say the page is already available, then choose the navigation target in section 5. |
| `absent` | Follow the intent rules above: ask one temporary/persistent choice for an ordinary open request, or execute an already-explicit temporary or first-install choice after explaining its effect. |
| `stopped` | An explicit request to open or start the existing owned persistent service authorizes `service start --confirm`; return the address only after success. An explicit temporary request follows the foreground rules below instead. |
| `unhealthy` | Explain that the owned process exists but the page is unavailable. An explicit open/start request authorizes `service restart --confirm`; return the address only after its owned health check succeeds. |
| `needs_repair` | `needs_repair` is a separate configuration rewrite: explain which owned LaunchAgent configuration will be rewritten and restarted, then obtain repair-specific authority before `service install --confirm`. A prior ordinary-open or first-install choice does not authorize that repair. If the user explicitly asked to repair the persistent service, explain the effect and execute without repeating the same decision. |
| `unavailable` | Explain the returned missing-launcher or incomplete-install message. Recommend repairing the Molis Work installation; do not fall back to an unknown binary or service. |
| `conflict` | Explain that the same LaunchAgent name or configured port is occupied by an unowned or user-modified process/configuration and Molis Work will not overwrite, adopt, stop, or replace it. Stop and let the user resolve ownership. |
| `unsupported` | Say that this operating system currently has no Molis Work system-level persistent-service integration. Do not claim background startup. An explicit temporary request follows the foreground route; otherwise ask once whether the user wants that temporary option. |

The persistent commands are:

```bash
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work" --confirm --json
"$HOME/.molis-work/bin/molis-work" service start --home "$HOME/.molis-work" --confirm --json
"$HOME/.molis-work/bin/molis-work" service restart --home "$HOME/.molis-work" --confirm --json
```

For `absent`, a clear initial request for login persistence or the user's answer to the temporary/persistent choice is the required path-specific authority for `install --confirm`; do not ask it twice. For `needs_repair`, obtain separate repair authority unless the user already asked for that repair. Do not reinterpret “试试看”, silence, an unrelated earlier approval, or authority for another path as confirmation.

## 4. Run the foreground path

“临时打开 Molis Work” means foreground operation. First inspect status so a healthy persistent service is not given a competing process on the same port.

- If managed state is `running`, return its address instead of starting a second server.
- If an owned service process is running but unhealthy or needs repair, explain the conflict and use the controlled repair/restart route; do not start a second server on the same port.
- Otherwise run the installed foreground launcher attached to the current terminal or Runtime process:

```bash
"$HOME/.molis-work/bin/molis-work-web" --home "$HOME/.molis-work"
```

Before launching, say plainly that closing the terminal or Runtime Session stops this temporary page. This is an explanation, not a repeated confirmation when the user already chose temporary use. Keep the process in the foreground. Do not add `nohup`, `&`, `disown`, a background shell, or a claim that it will survive logout.

## 5. Open the relevant project or Goal

Service health and the navigation target are separate decisions. After the page is healthy, but before opening it, make a read-only `molis_work_v1_context_resolve` call unless the user explicitly asked to browse all projects.

- If the current request has an explicit current Goal, call `molis_work_v1_goal_state` with its `goal_id` and open the returned `goal_url`. The same URL is the protected user entry for a concrete pending agreement, tree or acceptance decision. Ordinary records can continue without opening it.
- If there is no explicit current Goal and resolution is `bound`, open the returned connection `project_url`.
- If resolution is unbound or suggested, the bound target is unavailable, or the user explicitly asks to browse all projects, open the Web root so the project picker remains available.
- Use only official URLs returned by Molis Work. Do not construct a project or Goal URL from IDs, database paths, repository names, or browser history.
- Opening a project or Goal changes only Web focus. It does not bind or switch the Runtime project, record work, apply a pending decision, advance a Goal, or authorize another Goal write.
- If context resolution itself fails, report that failure instead of claiming that a guessed page is the current project.

## 6. Explain failures without switching paths

- If a service command fails, report its human-readable error and the returned stderr log path. Do not return the page address as though startup succeeded.
- If health readiness times out, say the process started but the page did not become usable, and point to `~/.molis-work/logs/web-service.error.log`.
- If foreground startup reports the port is already in use, re-run managed service status and report the actual state; do not pick a random port and pretend it is the configured service.
- On `unsupported`, do not use ordinary shell backgrounding. The only current fallback is an explicitly accepted foreground temporary run.
- Never turn a startup failure into CLI/SQLite Goal manipulation. Goal lifecycle remains available only through host-provided `molis_work_v1_*` MCP tools.
