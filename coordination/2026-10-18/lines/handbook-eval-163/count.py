# Count the BL-163 / T5 runs by the committed rule (spec §9.5). Usage: python3 count.py a.jsonl b.jsonl
import json, sys
from collections import Counter, defaultdict

def rows(path):
    try:
        return [json.loads(line) for line in open(path) if line.strip()]
    except FileNotFoundError:
        return []

a, b = rows(sys.argv[1]), rows(sys.argv[2]) if len(sys.argv) > 2 else []
VERSIONS = [("A0", "before"), ("A0", "after"), ("A1", "after")]
name = {("A0", "before"): "A0-前", ("A0", "after"): "A0-后", ("A1", "after"): "A1-后"}

print("## 甲")
voids = [r for r in a if r.get("valid") is not True]
for r in voids:
    print(f"  作废/无行: {name.get((r.get('arm'), r.get('side')))} {r.get('supplement')} #{r.get('run')}: valid={r.get('valid')} steer={r.get('steer')} enums={r.get('enums')} a1={r.get('a1InPrompt')} err={str(r.get('error'))[:120]}")
errors = Counter()
print("| 版本 | 补充 | 有效 | 有说明 | 处理方式对 | 出错 |")
print("| --- | --- | --- | --- | --- | --- |")
for v in VERSIONS:
    for s in ["S1", "S2", "S3", "S4"]:
        rs = [r for r in a if (r.get("arm"), r.get("side")) == v and r.get("supplement") == s and r.get("valid") is True]
        err = [r for r in rs if r.get("error") and r["error"] != "asked the user"]
        errors[v] += len(err)
        print(f"| {name[v]} | {s} | {len(rs)} | {sum(r['stated'] for r in rs)} | {sum(r['treatmentOk'] for r in rs)} | {len(err)} |")
print("出错（按版本）:", {name[v]: errors[v] for v in VERSIONS})

print("\n每次 acknowledge-inputs 调用的归类（有效跑）:")
for v in VERSIONS:
    c = Counter()
    for r in a:
        if (r.get("arm"), r.get("side")) != v or r.get("valid") is not True: continue
        for ack in r["acks"]:
            code = ack["code"]
            if code == "AGENT_INPUT_REF_REJECTED": code += "[" + ",".join(k for k in ack["kinds"] if k and k != "input") + "]"
            c[code] += 1
    print(f"  {name[v]}: {dict(c)}")

def miss_class(r):
    if r["stated"] and r["treatmentOk"]: return None
    if r["stated"]: return "说明了但处理方式不在集合里"
    if r.get("error") and r["error"] != "asked the user": return "出错"
    if not r["acks"]: return "收工前没说明（holdFinish=false）" if r["reminders"] == 0 else "提醒过仍没调"
    return "调了但没被收下：" + ",".join(sorted({x["code"] for x in r["acks"] if x["code"] != "accepted"}) or ["收下的没点名这条"])

print("\n没做到的类别（每版每种补充）:")
for v in VERSIONS:
    c = Counter(miss_class(r) for r in a if (r.get("arm"), r.get("side")) == v and r.get("valid") is True)
    c.pop(None, None)
    print(f"  {name[v]}: {dict(c)}")

print("\n没做到的跑（逐条归类用）:")
for r in a:
    if r.get("valid") is not True or (r["stated"] and r["treatmentOk"]): continue
    calls = [f"{x['code']}[{','.join(k for k in x['kinds'] if k)}]" for x in r["acks"]]
    print(f"  [{miss_class(r)}] {name[(r['arm'], r['side'])]} {r['supplement']} #{r['run']}: stated={r['stated']} treatment={r['treatment']} acks={calls} state={r['state']} err={str(r.get('error'))[:80]} reminders={r['reminders']} calls={r['modelCalls']}")
    for x in r["acks"]:
        if x["code"] != "accepted": print(f"      {x['code']}: items={json.dumps(x['items'], ensure_ascii=False)[:300]} result={str(x['result'])[:200]}")

print("\n照实记录（有效跑）:")
for v in VERSIONS:
    for s in ["S1", "S2", "S3", "S4"]:
        rs = [r for r in a if (r.get("arm"), r.get("side")) == v and r.get("supplement") == s and r.get("valid") is True]
        if not rs: continue
        kinds = Counter(str(r.get("kind")) for r in rs if r["stated"])
        treat = Counter(str(r.get("treatment")) for r in rs)
        tomorrow_shifted = sum(all((t["due_after"] != t["due_before"]) == (t["due_before"] == "2026-10-17") for t in r["todos"] if t["status"] != "done") for r in rs)
        today_shifted = sum(all((t["due_after"] != t["due_before"]) == (t["due_before"] == "2026-10-16") for t in r["todos"] if t["status"] != "done") for r in rs)
        kept = sum(all(t["title_kept"] and t["notes_kept"] for t in r["todos"]) for r in rs)
        created = sum(any("王老师" in c["title"] for c in r["created"]) for r in rs)
        print(f"  {name[v]} {s}: treatment={dict(treat)} kind={dict(kinds)} 只推后了今天的={today_shifted} 只推后了明天的={tomorrow_shifted} 标题说明未变={kept} 建了王老师={created} "
              f"提醒={sum(r['reminders'] for r in rs)} 平均调用={sum(r['modelCalls'] for r in rs)/len(rs):.1f} 平均秒={sum(r['ms'] for r in rs)/len(rs)/1000:.0f}")

if b:
    print("\n## 乙")
    for arm in ["B0", "B1"]:
        rs = [r for r in b if r.get("arm") == arm]
        voided = [r for r in rs if r.get("voided")]
        counted = [r for r in rs if not r.get("voided")]
        route_bad = [r for r in counted if r.get("routeOk") is False]
        wrong = [r for r in counted if not r.get("twoPlaces")]
        err = [r for r in counted if r.get("error")]
        print(f"  {arm}: 计入 {len(counted)}，作废 {len(voided)}，分路不对 {len(route_bad)}，位数不是 2（含没写） {len(wrong)}，出错 {len(err)}，"
              f"中文注释 {sum(bool(r.get('chineseComment')) for r in counted)}，又问 {sum(r.get('askedAgain', 0) for r in counted)}")
        for r in rs:
            print(f"    #{r.get('run')}: voided={r.get('voided')} route={r.get('routeOk')} round={r.get('roundWritten')} two={r.get('twoPlaces')} zh={r.get('chineseComment')} "
                  f"asked={json.dumps(r.get('asked'), ensure_ascii=False)[:160]} answered={json.dumps(r.get('answered'), ensure_ascii=False)[:80]} err={str(r.get('error'))[:80]}")
