# 金样的 Home 库样本

一个已签名的沙箱插件，Home 范围，声明自己的 Home 库（`notes` 一张表）和一个主人文件（`notes.txt`）。金样 Home 装上它，`plugin-libraries` 台账才有行、才有一个按插件动态登记的库和 `plugin-files/` 下的文件：语料 `tests/fixtures/replay-plugins/` 里的样本都是项目范围，装不出这一类（设计见 `specs/upgrade-continuity/golden-replay-design.md` §2）。

`v1.json`、`v2.json` 由 `node scripts/golden/sign-home-library.mjs` 现生成一把 ed25519、用 `signPluginPackage` 一次签好。私钥只活在那一次进程里，不入库、不留存。两份都是真实的发布者签名，金样和回放只安装它们，不需要钥匙。

`v2` 只有版本号和入口第一行的注释与 `v1` 不同，库的结构和版本都不变：回放要证明的是同一个安装升级后还读得到之前写的行（§4 第 7 步），不是插件自己的库迁移。

样本的代码不写时间、不写随机值，所以生成两次库的字节相同。要改样本就重新签；已入库的金样里存着旧包，新包只跟着新一代金样进去。
