import subprocess, collections, datetime, re

T0 = "2026-10-12T04:15:00"     # coordination task start (UTC)
OURS = {"jing xu", "Creamie X"}
M = "/Users/creamiex/molis-ai/molis-work"
P = "/Users/creamiex/molis-ai/prologue"
LINES = ["采用线", "回执线", "交互线", "情境线", "统筹"]

def git(repo, *a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=True).stdout

def info(repo, h):
    p, an, ad, s = git(repo, "show", "-s", "--format=%P%x1f%an%x1f%aI%x1f%s", h).strip().split("\x1f")
    ad = datetime.datetime.fromisoformat(ad).astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M")
    return dict(h=h, merge=len(p.split()) > 1, an=an, ad=ad, s=s)

def line_of(repo, b):
    if repo == P:
        if "input-receipts" in b: return "回执线"
        if "ask-user-fields" in b: return "交互线"
        return "采用线"
    if "prologue-adoption" in b or "adoption-main-sync" in b: return "采用线"
    if "input-receipts" in b: return "回执线"
    if "interaction" in b or "agent-typed-questions" in b: return "交互线"
    if "context" in b: return "情境线"
    if "integration/batch1" in b: return "统筹"
    return None

def refs(repo, pat):
    return [r for r in git(repo, "for-each-ref", "--format=%(refname:short)", pat).split()
            if r not in ("origin/HEAD", "origin", "origin/main", "main")]

def inventory(repo, main_start):
    rows = {}
    # 1) merged into main during the task: first-parent PR merges on main since main_start
    for line in git(repo, "log", "--first-parent", "--format=%H%x1f%P%x1f%s", f"{main_start}..origin/main").splitlines():
        h, parents, s = line.split("\x1f")
        ps = parents.split()
        m = re.search(r"Merge pull request #(\d+) from molis-ai/(\S+)", s)
        if len(ps) < 2 or not m: continue
        pr, br = m.group(1), m.group(2)
        ln = line_of(repo, br)
        if ln is None: continue          # someone else's PR (Molis main has many)
        if info(repo, h)["an"] not in OURS: continue   # merged by someone else (e.g. #471/#472 by yijunw0212)
        brought = git(repo, "rev-list", f"{ps[0]}..{ps[1]}").split()
        for c in [h] + brought:
            if c in rows: continue
            d = info(repo, c)
            cl = ln
            if repo == P:
                if pr == "5":
                    cl = "采用线" if d["s"].startswith("merge: 并入 origin/main") or d["s"].startswith("Merge pull request") else "回执线"
                elif pr == "4":
                    if d["s"].startswith("feat(agent): 输入回执第一刀"): cl = "回执线"
                    elif d["s"].startswith("feat(effect-policy): AskUser"): cl = "交互线"
            via = f"#{pr}" + ("" if cl == ln else f"（由{ln}整合进 main）")
            d.update(status="已进 main", line=cl, where=via, pre=d["ad"] < T0)
            rows[c] = d
    in_main = set(git(repo, "rev-list", "origin/main").split())
    # 2) on remote branches but not in main
    remote = refs(repo, "refs/remotes/origin")
    contain = collections.defaultdict(list)
    for r in remote:
        for c in git(repo, "rev-list", f"--since={T0}Z", f"origin/main..{r}").split():
            contain[c].append(r.removeprefix("origin/"))
    for c, brs in contain.items():
        if c in rows or c in in_main: continue
        d = info(repo, c)
        if d["an"] not in OURS or d["ad"] < T0: continue
        lines = [line_of(repo, b) for b in brs]
        ln = "采用线" if any(("handoff-prologue-adoption" in b) for b in brs) else next((x for x in lines if x), "?")
        d.update(status="已推远端（未进 main）", line=ln, where="、".join(sorted(set(brs))), pre=False)
        rows[c] = d
    if repo == M:
        handoff = {"采用线": "feature/handoff-prologue-adoption", "回执线": "feature/handoff-ai-input-receipts",
                   "交互线": "feature/handoff-ai-interaction", "情境线": "feature/handoff-contextual-actions"}
        hsubj = {ln: set(git(repo, "log", "--format=%s", f"origin/main..origin/{b}").splitlines()) for ln, b in handoff.items()}
        for d in rows.values():
            if d["status"] != "已推远端（未进 main）": continue
            hb = handoff.get(d["line"])
            if hb and hb in d["where"].split("、"):
                d["status"] = "已推远端：在交接 PR 分支上"
            else:
                if "agent-typed-questions" in d["where"]: d["where"] += "（C1+H1：等 #408 进 main 后并入 #410）"
                elif "agent-interaction-contract" in d["where"]: d["where"] += "（C1a，#447 已作废关闭）"
                elif hb and d["s"] in hsubj[d["line"]]: d["where"] += "（旧版本；同名提交已以新提交进交接分支）"
                d["status"] = "已推远端：只在其他分支"
    else:
        for d in rows.values():
            if d["status"] != "已推远端（未进 main）": continue
            if "input-receipts-s4" in d["where"]: d["where"] += "（PR #10 待合）"
            if "p2g-scope" in d["where"]: d["where"] += "（尚未开 PR）"
    # 3) local only
    remote_all = set()
    for r in remote + ["origin/main"]:
        remote_all.update(git(repo, "rev-list", f"--since={T0}Z", r).split())
    for r in refs(repo, "refs/heads"):
        for c in git(repo, "rev-list", f"--since={T0}Z", f"origin/main..{r}").split():
            if c in rows or c in remote_all or c in in_main: continue
            d = info(repo, c)
            if d["an"] not in OURS: continue
            note = ""
            if r in ("feat/context-w2-toolbar", "feat/context-w2-bus-view"): note = "（旧版本，同名提交已以新版本进 #411）"
            if r == "feature/adoption-s2-integration": note = "（已作废：S2 改由回执线合进整合末端）"
            if r == "integration/batch1": note = "（统筹的批量全量集成分支，不需要推）"
            d.update(status="只在本地", line=line_of(repo, r) or "?", where=r + note, pre=False)
            rows[c] = d
    return list(rows.values())

def emit(label, rows, out):
    for ln in LINES:
        sel = [r for r in rows if r["line"] == ln]
        if not sel: continue
        out.append(f"\n### {label} · {ln}")
        for st in ["已进 main", "已推远端：在交接 PR 分支上", "已推远端（未进 main）", "已推远端：只在其他分支", "只在本地"]:
            part = sorted([r for r in sel if r["status"] == st], key=lambda r: r["ad"])
            if not part: continue
            content = [r for r in part if not r["merge"]]
            merges = [r for r in part if r["merge"]]
            pre = [r for r in content if r["pre"]]
            out.append(f"\n**{st}**：{len(content)} 个内容提交" + (f"（其中 {len(pre)} 个是任务开始前就有的）" if pre else "") + f"，{len(merges)} 个合并提交\n")
            out.append("| 提交 | 时间 UTC | 作者 | 说明 | 位置 |\n| --- | --- | --- | --- | --- |")
            for r in content:
                s = r["s"].replace("|", "\\|")
                tag = "（任务前）" if r["pre"] else ""
                out.append(f"| `{r['h'][:8]}` | {r['ad'][5:].replace('T', ' ')} | {r['an']} | {s}{tag} | {r['where']} |")
            if merges:
                out.append("\n合并提交：" + "；".join(f"`{r['h'][:8]}`（{r['where']}）{r['s'][:60]}" for r in merges))

out = ["# 四条线进展盘点", "",
       f"生成：{datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M} UTC。范围：2026-10-12 04:15 UTC（北京时间 12:15，统筹开始）之后的提交。",
       "「已进 main」= 随我们的 PR 合进该仓库 main；「已推远端」= 在某个远端分支上但没进 main；「只在本地」= 没有任何远端分支包含。",
       "作者 Creamie X 是改用 jing xu 身份之前的提交（未合并的已改写；已进 main 的改不了）。"]
rm = inventory(M, "02ceba8c")
rp = inventory(P, "4f7110fe")
out.append("\n## Molis（molis-ai/molis-work）")
emit("Molis", rm, out)
out.append("\n## Prologue（molis-ai/prologue）")
emit("Prologue", rp, out)
summ = collections.Counter((r["line"], r["status"], "合并" if r["merge"] else "内容") for r in rm + rp)
out.append("\n## 汇总（内容提交 / 合并提交）\n\n| 线 | 已进 main | 已推远端·交接 PR 分支（Molis）或待合分支（Prologue） | 已推远端·只在其他分支 | 只在本地 |\n| --- | --- | --- | --- | --- |")
for r in rm + rp:
    if r["status"] == "已推远端（未进 main）": r["status"] = "已推远端：在交接 PR 分支上"
summ = collections.Counter((r["line"], r["status"], "合并" if r["merge"] else "内容") for r in rm + rp)
for ln in LINES:
    cells = []
    for st in ["已进 main", "已推远端：在交接 PR 分支上", "已推远端：只在其他分支", "只在本地"]:
        cells.append(f"{summ[(ln, st, '内容')]} / {summ[(ln, st, '合并')]}")
    out.append(f"| {ln} | " + " | ".join(cells) + " |")
print("\n".join(out))
