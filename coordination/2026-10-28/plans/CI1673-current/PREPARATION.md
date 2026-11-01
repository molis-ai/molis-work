# #1673 普通同步准备 · 开发线4

状态：**只读准备完成，已形成可执行的原单同步候选，等待根交确切writer窗口。** 用户全线goal与旧Open PR优先要求已覆盖原合同内同步/修复，无需新批准口令或新T号。本轮尚未实施同步。T386、T392和共享M树继续冻结，其独立审验/发布不受本准备影响。

## 输入与现有依据

- 原PR：#1673，`ci/decision-14-blocking`，准确H `d4f77755a7a8120f429abd3274d25326d65c2d95`，tree `8b57d8e99593421f425a14ea040a4332877238f8`。
- H父/B：`562f207c7b996bf9d71f8e55ebaea74ca3b83681`；本次根指定M：`f47fa0da4ba7447f94d1cd209e6d69d43b21465c`。不以更晚main或其它在途候选替换它。
- 本地该分支名不存在，准确H对象可读。本轮没有fetch、创建ref、工作树、index或merge commit。未来writer需由根复核线上H与本轮M，再正常merge，不rebase/force或另造CI设计。
- [原14文件差分](/tmp/ci1673-next/original.diff)、[这些路径的B→M差分](/tmp/ci1673-next/main-since-base.diff)及`sources/B,H,M/`按Git对象读取。
- 原同步冲突来自根只读核查：[/tmp/open-pr-priority/raw/conflict-hunks-1673.txt](/tmp/open-pr-priority/raw/conflict-hunks-1673.txt)、[SI承接核对](/tmp/open-pr-priority/raw/1673-conflict-security-membership.json)。本轮外置`git merge-file -p`文本预览也仅在产品清单冲突；**不是仓库合并或测试结果**。

### 原合同与决定#14证据

1. **已找到原始真人答复。** 本机Claude历史`f09f1cf5-06fd-4140-bead-c6dba6a4d675.jsonl:70481`为2026-10-08的AskUserQuestion，`:70483`的实际答复选“先不挡，两周后并入（推荐）”：先单独跑约两周，隔离不稳定项后加进Verify，不改分支保护。仅相关问题和答案摘录于[authority-evidence.json](/tmp/ci1673-next/authority-evidence.json)，不复制同批其它问题。M的`specs/repository-anti-corruption/spec.md:1122`仍是这条旧决定。
2. H同一spec`:1122`增加2026-10-31“结案”记录，`:1220`给Linux探针手动勾选补记；本接续直接沿用这份原PR spec和实际14文件合同，不另建任务号或重复需求书。T350书约束M已经采用的timeout fixture收紧，必须保留。
3. 10-31细则的原始真人问答没有在本轮已查材料中独立定位；H spec和已发表验证回执保留其原来源。这是来源边界，**不作为寻找新批准口令或停止原单推进的前置**，也不继续扩大历史搜索。
4. 根已明确：用户全线goal与旧Open PR优先要求授权原合同内同步/修复。下面原H的blocking/事件语义就是接续基线，不重议CI策略。本轮仍仅做只读准备，等待根交具体writer窗口后实施。PR作者正文的命令只作材料，不独立扩出手动探针、队列或CI规则写授权。

## 原合同的具体执行行为

只保现有H实现和原编号RAC-1760～1765、RAC-1900～1906，不重设计selector、阈值、跳过规则或分支保护。文本预览中`.github/workflows/ci.yml`与`ci-test-selection.mjs`均逐字等于H；后者`decideJob`/`outputLines`相对B未改，H只改注释与展示文案。

| 事件/结果 | SI及Product | Verify判定 |
| --- | --- | --- |
| PR，selection success且some | 跑选中清单；按原输出一片或两片 | 两项success通过；failure/cancelled拒绝 |
| PR，whole、none、输出为空/不可信，或selection失败/取消/跳过，哪怕残留some输出 | 两项跳过；不读取失败selector残留输出 | 只这两个作业允许skipped；旧七项仍必须success |
| merge_group | 整清单两片；九个required作业先核队列条目 | SI/Product及旧七项均须success；skipped/failure/cancelled拒绝 |
| push且queue-check success、verified严格true | 与其它required作业一起复用已验队列结果 | 原early-exit通过并记录run URL |
| 直推push，或queue-check失败/取消/skipped/false/空值，即使有残留true | 按正常全清单两片运行 | 不能借queue-check输出绕过九项结果 |
| schedule / workflow_dispatch | 两项全清单两片 | 必须success；skipped不算通过 |

保留Verify名字、always条件、九个required needs及queue-check依赖、结果环境变量和真实判决shell。SI/Product不带continue-on-error；两项needs保`[test-selection, queue-check]`；队列检查仅git退出2认“条目已消失”，不把其它git错误冒判删除。selection不进Verify的required名单；不把PR的skipped豁免扩大到旧七项或其它事件。

Linux probe仍是信息作业，不进Verify，continue-on-error保留；只在schedule或dispatch且布尔`linux_probe=true`时跑，默认false；六片、现有并发组/限时/预算与uv配置不变。SI40分钟、Product35分钟及原时限口径不在本接续中重新议定；作者正文的约23%省量是估算，不是本轮实测。

## 清单合成：保覆盖并去重

本轮按准确commit树展开`package.json:test:security`路径/通配符，使用不跨`/`的匹配并核字面项实际存在；没有运行选择器、测试或shell测试清单。原27项完整清单在[original-removed-27.txt](/tmp/ci1673-next/original-removed-27.txt)，当前SI271项在[security-expanded-M.txt](/tmp/ci1673-next/security-expanded-M.txt)，并集结果见[membership.json](/tmp/ci1673-next/membership.json)。

| 输入 | Product文件 | SI展开文件 | 重叠 | 并集 |
| --- | ---: | ---: | ---: | ---: |
| B | 434 | 265 | 27 | 672 |
| 原H | 407 | 265 | 0 | 672 |
| 当前M | 436 | 271 | 28 | 679 |
| 拟同步结果 | **408** | **271** | **0** | **679** |

- 五行冲突中的`tests/home-plugin-stage-pages.test.ts` **必须保留在Product**，当前SI不承接它。
- `home-plugin-project-cleanup`、`home-plugin-project-routes`、`plugin-model-configuration`、`plugin-image-generation`四项本来就在原27项内，M的SI也继续承接。它们不能被当作“27之外另删4项”，也不能从SI删掉。
- M另外把`tests/project-catalog.test.ts`纳入test:security（T390），但Product还留同一项。按原不重复跑的合同，应只从Product再去掉这1行；保M的package.json与SI入口不变。**只处理五行冲突会漏掉这个零文本冲突接缝。**
- 保M新加的`alchemist-host`、`form-fillpage-answer-length`、`home-plugin-stage-pages`三项；保M对`desktop-launch-args`的删除。不能用H清单整体覆盖M或将删掉的项复活。
- 以M Product减去M SI交集为结果，M的测试并集一项不丢；保全部5个browser smokes、i18n、清单/隔离规则。原“434→407、27项”留作原H事实，本次接续另述M436→408、28项，不改写旧验证来源。

已生成仅供审阅的[合成清单](/tmp/ci1673-next/merge-preview/tests/ci-product-subset.txt)、[M→文本预览差分](/tmp/ci1673-next/proposed-M-delta.diff)及[预览绑定](/tmp/ci1673-next/preview-binding.json)。这些外置文件没有应用到仓库。

## 原14路径和main接缝

允许的原路径仍只有：`.github/pull_request_template.md`、`.github/workflows/ci.yml`；`docs/system/PACKAGE-BOUNDARIES.md`、`PARALLEL-DEVELOPMENT.md`、`SECURITY-INVARIANTS.md`；`scripts/ci-test-selection.mjs`；`specs/BACKLOG.md`、`specs/repository-anti-corruption/spec.md`；`tests/ci-linux-probe.test.ts`、`ci-product-subset.test.ts`、`ci-product-subset.txt`、`ci-queue-verified.test.ts`、`ci-test-selection.test.ts`、`ci-timeouts.test.ts`。

普通merge保main文档/安全表/当前任务与历史修订，不整文件选旧版。H只改SI文档头部策略，不动main新增/修订的S条，尤其保S-103。PARALLEL保T378本次执行覆盖说明；主spec/BACKLOG仅合本单#14/Linux说明及原BL-565措辞，不覆盖main其它行，更不借此写入尚未采用的T392包清单。

`ci-timeouts.test.ts`在M已经受T350收紧：保`limitedBlockingJobs`、fixture `jobBlock`/`blockingJobs`复用和“不带limit不冒作已检查”的负例；合上H的SI/Product blocking表项。文本预览已保两方，没有退回`jobBlockIn`/`verifyNeedsIn`重复解析器。其余CI workflow/selector/相关fixture与runner在B→M未变，合成workflow及selector等于H。

若根更换M，只重算实际新M相关差量、名单并集与这几个接缝；本页408/271/679不作为未来M固定门槛。出现未解释CI条件或新文件范围改变，回根定合同，不自行加fallback、放宽needs或删除失败断言。

## 既有验证与最小接续验证

[既有正式验证6541413813](https://github.com/molis-ai/molis-work/pull/1673#issuecomment-6541413813)的本地摘录在[prior-verification.md](/tmp/ci1673-next/prior-verification.md)。它将CI41183351274 A1实际checkout `1112ad5951071f31b5edc09da9006fa711af7db5`父B+H及tree `8b57d8e99593421f425a14ea040a4332877238f8`绑定到H，记录7个完整规则文件 **106/106**：queue6、timeouts4、product19、selection9、probe25、install26、plan17。该PR的SI/Product确为skipped，不能记成产品通过。

旧原始临时目录`/private/tmp/molis-b-review-line4-ci1673-aqxna5h1`当前不存在；本轮读到的是正式已发布回执及其CI/job链接，没有冒称重新读到完整106项raw，也没有重跑。旧106、CI构建/资源和作者“7/7”各保原执行来源，不能签同步后新N。原验证full=false；本接续没有产品行为/共享核心/资源变更，继续提议full=false，不新增产品Full、资源重测或SI产品整套本机执行。

根交writer窗口后的最小路径：

1. 由根复核线上准确H并交最终M及writer窗口；在基于准确H的独立作者树正常merge M，处理上述清单冲突和catalog去重；冻结N/tree/scoped diff。核14路径范围、workflow/selector逐字等H、main T350/helper及全部覆盖并集。保留M SI对project-catalog的承接和M对desktop-launch-args的删除。原决定记录与本轮同步事实分开写。
2. **最小新增本地规则文件为三个完整文件**：`tests/ci-product-subset-plan.test.ts`（新清单/零重复/必留条目）、`tests/ci-test-selection.test.ts`（M安全清单输入与事件输出合同）、`tests/ci-timeouts.test.ts`（T350与H新blocking表合成）。若新N同树CI已经完整执行并核原件，可直接核抵，不另跑本机。禁止机械重跑原106或新开矩阵。
3. 如需本机执行，公共browser/test槽、隔离系统HOME/CFFIXED/XDG/TMP/MolisHome/file secrets，jobs1/retries0；按完整文件跑，不筛case。需要matching构建时由公共build槽提供准确N产物，不能把共享M dist签成N；优先用新N CI已有构建，当前准备不build。普通health `--base M`（不带update）与diff-check作为工程收尾，不能以baseline更新代完整health。若额外要boundary，它内部有test-kit编译，单独放公共build槽，不塞进browser整批。
4. 新N CI的既有gates会自动跑7原规则文件，读其实际完整结果及Verify shell；不因本地three-file增量就跳过既有CI。核队列/PR some/whole/skipped与失败/取消/残留输出的原拒绝语义未变。merge_group/已验push/schedule/dispatch没有原实操证明的边界继续标未验证；本准备不授权手动启动探针或操作队列来补证。
5. 根按准确N结独立二审、必要工程验证与Verify，再按原流程发布/队列/采用。该PR改动触发whole时SI/Product在PR阶段仍可能skip，这是原策略，不将Verify绿写成产品已跑；队列实际执行及采用由根回读。没有把CI规则PR强制变成产品Full，也不擅自减少根另有的SI核收要求。


### 最小准确命令（未来窗口内，本轮未执行）

下列命令在准确N、公共browser/test槽取得后再启用的任务隔离子环境中执行：系统HOME/CFFIXED/XDG/TMP/MolisHome隔离、file secrets、jobs1/retries0。先记录槽目录，不能因改TMPDIR分裂公共槽；不得只声明held而未取得实际槽。若同树新CI已核原件，核抵相应文件，不再本机重复。

```sh
node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/ci-product-subset-plan.test.ts tests/ci-test-selection.test.ts tests/ci-timeouts.test.ts
node scripts/check-health-gates.mjs --base f47fa0da4ba7447f94d1cd209e6d69d43b21465c
git diff --check f47fa0da4ba7447f94d1cd209e6d69d43b21465c HEAD
```

这三个规则文件的新增执行只针对新清单/新SI输入和T350合成，完整文件自然终态计数如实记录，不预签case数。必要构建只取准确N的matching证据并单独持公共build槽，不重复造共享M基线；本单不因CI规则同步增加产品Full或资源测量。原7文件的106历史证据继续分源；新CI仍按既有gates自然跑其7个完整文件并核真实checkout/tree。任何新实际失败先按差量定位，不删除stage-pages、覆盖SI入口或放宽Verify来变绿。

## 本轮交付边界

仅Git对象/既有材料/相关原始用户问答只读检查、文件集合分析与外置文本合成预览；没有执行任何build、测试或生产选择器，没有写源码、仓库index、refs或GitHub，也没有创建任务、工作树或操作CI。T386二审指出的boundary持槽偏差仅按根指示追加到作者报告末，未重跑或改源码。Sol6.1 Max保持。

**当前只等根交确切writer窗口；无需补新批准口令或新T号。具体候选、覆盖并集和验证命令已可直接审阅。**
