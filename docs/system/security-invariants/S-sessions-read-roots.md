# S-sessions-read-roots

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-sessions-read-roots | 外部会话文件只在本机用户目录和操作系统应用目录下、工具登记表声明的会话根目录内打开已核实的常规文件（第 34 批，设计 `specs/sessions-rebuild/contract-design.md` §3.1、§9.4）：① 会话根本身、其任一祖先目录段、子目录段或目标文件是符号链接时在打开前拒绝，绝不跟随指向 `~/.ssh`、`/etc`、`<Home>/feed/secrets.json` 等任意外部位置；② 相对路径含 `..`、空段、绝对路径或解析后逃出声明根时一律拒绝；③ 打开时加 `O_NOFOLLOW` 并对已打开描述符核对 `fstat.isFile()` 与 `(dev, ino)`，FIFO、Unix 套接字、设备文件与打开瞬间替换的目标一律关闭并拒绝读取；④ 未经本人显式打开 `session_read_scopes.allowed` 的来源根目录连列目录也不发生。 | `apps/local-host/src/sessions-file-roots.ts`、`horizontal/sessions/src/ports.ts`、`horizontal/sessions/src/discovery-runner.ts`、`horizontal/sessions/src/session-queries.ts` | `tests/security-invariants-external-sessions.test.ts`「S-sessions-read-roots 1: symlinked root, ancestor, subdirectory or file under a tool session root is refused before open」「S-sessions-read-roots 2: non-regular files and paths escaping the declared session root are never read」 | — |
