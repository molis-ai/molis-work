"""Offline local Laya worker. One process per experiment; never truncates inputs."""
import sys, os, json, time, contextlib
os.environ.update(USE_TF="0", HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", TOKENIZERS_PARALLELISM="false")
checkpoint = os.path.realpath(sys.argv[1])
sys.path.insert(0, os.path.dirname(checkpoint))
agent = None
startup_ms = None
try:
    start = time.perf_counter()
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        torch.set_num_threads(4)
        from rl_agent_api import RLAgent
        from rl_common import render_options, serialize_state
        agent = RLAgent(checkpoint, device="cpu")
    startup_ms = (time.perf_counter() - start) * 1000
except Exception as error:
    print(json.dumps({"fatal": "Laya 加载失败：" + type(error).__name__ + ": " + str(error)[:200]}), flush=True)
    sys.exit(1)
first = True
for line in sys.stdin:
    try:
        req = json.loads(line)
        question = {"type": "choice", "instructions": req["task"]["instructions"], "criteria": {c["key"]: c["description"] for c in req["task"]["criteria"]}}
        q = agent._to_internal(question)
        tok = agent.tok
        if any(tok.mask_token in s for s in [req["input"], question["instructions"], *render_options(q)]):
            raise ValueError("输入含保留 mask token，不能原样评估")
        head = tok("choice question: " + q["ins"], add_special_tokens=False)["input_ids"]
        opts = [tok(" " + text, add_special_tokens=False)["input_ids"] for text in render_options(q)]
        option_len = sum(1 + len(o) for o in opts)
        if any(len(o) > 48 for o in opts) or agent.cfg["head_max_len"] - option_len < 16 or len(head) > max(8, agent.cfg["head_max_len"] - option_len):
            raise ValueError("任务或选项超过 Laya head/option 上限；未截断")
        state_tokens = len(tok(serialize_state(req["input"]), add_special_tokens=False)["input_ids"])
        total = len(head) + option_len + state_tokens + 4
        if total > agent.cfg["max_len"]:
            raise ValueError("材料超出 Laya 上下文：%d > %d tokens；未截断" % (total, agent.cfg["max_len"]))
        start = time.perf_counter()
        with contextlib.redirect_stdout(sys.stderr):
            result = agent.system_one(req["input"], {"decision": question})
        elapsed = (time.perf_counter() - start) * 1000
        answer = result["answers"]["decision"]
        print(json.dumps({**answer, "model": "laya-multilingual", "model_ms": elapsed, "startup_ms": startup_ms if first else 0,
            "input_tokens": result["usage"]["input_tokens"], "output_tokens": 0, "device": str(agent.device), "input_characters": len(req["input"]),
            "runtime_version": "torch=" + torch.__version__, "reported_cost_usd": None, "cost_basis": "本地 CPU；电力、硬件与加载成本未折算"}, ensure_ascii=False), flush=True)
        first = False
    except Exception as error:
        print(json.dumps({"error": str(error)[:400]}, ensure_ascii=False), flush=True)
