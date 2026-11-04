# 生成 board.json：#1743 的正文、更新时间和每行的认领账号。用法：board_json.py <输出.json>
import json,os,subprocess,sys,tempfile
here=os.path.dirname(os.path.abspath(__file__))
i=json.loads(subprocess.check_output(['gh','api','repos/molis-ai/molis-work/issues/1743']))
with tempfile.TemporaryDirectory() as d:
    p=os.path.join(d,'claimers.json')
    subprocess.check_call([sys.executable,'-I',os.path.join(here,'claimers.py'),p])
    claimers=json.load(open(p))
json.dump(dict(body=i['body'],updated_at=i['updated_at'],claimers=claimers),open(sys.argv[1],'w'),ensure_ascii=False)
