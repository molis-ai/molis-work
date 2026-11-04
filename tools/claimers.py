# 从 #1743 正文的编辑历史找出每行第一次被认领时是谁改的。用法：claimers.py <输出.json>
import json,re,subprocess,sys,time
Q='''query($after:String){repository(owner:"molis-ai",name:"molis-work"){issue(number:1743){author{login} body userContentEdits(first:25,after:$after){pageInfo{hasNextPage endCursor} nodes{editor{login} diff}}}}}'''
# 每版都是完整正文，一页很大，偶尔网关超时；每页最多试三次
def page(after):
    cmd=['gh','api','graphql','-f','query='+Q]+(['-f','after='+after] if after else [])
    for attempt in range(3):
        r=subprocess.run(cmd,capture_output=True,text=True)
        if r.returncode==0:return json.loads(r.stdout)['data']['repository']['issue']
        print(r.stderr[:300],r.stdout[:300],file=sys.stderr)
        time.sleep(5*(attempt+1))
    sys.exit(1)
nodes=[];after=None
while True:
    d=page(after);e=d['userContentEdits'];nodes+=e['nodes']
    if not e['pageInfo']['hasNextPage']:break
    after=e['pageInfo']['endCursor']
def rows(md):
    cur=None;n={};o={}
    for l in md.splitlines():
        if not l.startswith('|') or re.match(r'^\|\s*(---|批次\s)',l):continue
        c=[x.strip() for x in re.split(r'\s\|\s',' '+l.strip()[1:-1]+' ')]
        if len(c)!=6:continue
        if c[0]:cur=c[0];n[cur]=0
        n[cur]+=1;o[f'{cur}-{n[cur]}']=c[2]
    return o
hist=[((e['editor'] or {}).get('login'),e['diff'] or '') for e in reversed(nodes)]
who={}
prev={}
for login,md in hist:
    for k,cell in rows(md).items():
        if cell and cell!='—' and not prev.get(k):who[k]=login
    prev=rows(md)
now=rows(d['body'])
out={k:who.get(k,d['author']['login']) for k,c in now.items() if c and c!='—'}
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False)
