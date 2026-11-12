# 金样 Home 0.1.1-dev.2

由 `node scripts/golden-home.mjs create --version 0.1.1-dev.2` 生成，在同样的代码上运行同一命令可以逐字节重新得到（设计见 `specs/upgrade-continuity/golden-replay-design.md`）。`check` 做这项比较，只有清单记下的提交不比。

内容全部是生成脚本写死的合成样例，没有真实的人名、邮箱和密钥。只经各主人的动作和设置入口写入，例外记在清单的 `imports`。`feed/secrets.json` 用的钥匙只用于金样，写在清单的 `test_key`。
