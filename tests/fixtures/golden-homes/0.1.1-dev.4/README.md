# 金样 Home 0.1.1-dev.4

由 `node scripts/golden-home.mjs create --version 0.1.1-dev.4` 生成，在同样的代码上运行同一命令可以逐字节重新得到（设计见 `specs/upgrade-continuity/golden-replay-design.md`）。`check` 做这项比较，只有清单记下的提交不比。

内容全部是生成脚本写死的合成样例，没有真实的人名、邮箱和密钥。只经各主人的动作和设置入口写入，例外记在清单的 `imports`。`feed/secrets.json` 用的钥匙只用于金样，写在清单的 `test_key`。

这一份是用 main `7a4c7f982d` 的代码生成的（第 41 批合入之前）：它存着 Goals 项目表的第 3 版和当时还在的 Home 库 `goals/goals.db`。第 41 批删了方法库和那个 Home 库的写入脚本，所以在现在的代码上不能再逐字节重新生成它；要重做，检出那个提交再运行上面的命令。
