#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 data/yipin_data.json 的逸品数据直接写进 index.html。
—— 不做运行时打补丁，数据固化在 HTML 里，页面打开即是逸品的。
在 GitHub Actions 里跑，改完自动 commit。
"""
import json, re, sys, io, datetime, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'index.html')
TPL  = os.path.join(ROOT, 'template', 'index.html')
DATA = os.path.join(ROOT, 'data', 'yipin_data.json')

def die(msg):
    print('❌ ' + msg); sys.exit(1)

SRC = TPL if os.path.exists(TPL) else HTML
h = io.open(SRC, encoding='utf-8').read()
print('源模板: ' + os.path.relpath(SRC, ROOT))
d = json.load(io.open(DATA, encoding='utf-8'))
orig_len = len(h)
report = []

# ── 1) monthConfigs 整体替换 ─────────────────────────────
i = h.find('const monthConfigs')
if i < 0: die('找不到 const monthConfigs')
semi = h.find(';', i)
j = h.find('\n', semi)
if j < 0: die('monthConfigs 行尾定位失败')
mc = {}
for m, cfg in d.items():
    mc[m] = {
        'label': cfg['label'], 'lastUpdated': cfg['lastUpdated'],
        'products': cfg['products'], 'dailyData': cfg['dailyData'],
        'orders': cfg.get('orders', []), 'personalData': cfg['personalData'],
    }
h = h[:i] + 'const monthConfigs = ' + json.dumps(mc, ensure_ascii=False, separators=(',', ':')) + ';' + h[j:]
report.append('monthConfigs → ' + ' / '.join(mc.keys()))

# ── 2) orders / ordersJun / ordersJul 换成逸品订单 ────────
DEFAULT_MONTH = sorted(d.keys(), key=lambda k: int(k.replace('月', '')), reverse=True)[0]
for name in ('const orders =', 'const ordersJun =', 'const ordersJul ='):
    p = h.find(name)
    if p < 0: continue
    e = h.find('];', p)
    if e < 0: die(name + ' 结束符定位失败')
    arr = d[DEFAULT_MONTH].get('orders', []) if name == 'const orders =' else []
    h = h[:p] + name + ' ' + json.dumps(arr, ensure_ascii=False, separators=(',', ':')) + h[e + 1:]
report.append('orders → %s 月 %d 行；ordersJun/ordersJul 置空' % (DEFAULT_MONTH, len(d[DEFAULT_MONTH].get('orders', []))))

# ── 3) 月份下拉 ──────────────────────────────────────────
opts = re.findall(r'<option value="\d+月"[^>]*>[^<]*</option>', h)
if opts:
    first = h.find(opts[0]); last = h.find(opts[-1]) + len(opts[-1])
    months = sorted(d.keys(), key=lambda k: int(k.replace('月', '')), reverse=True)
    new = ''.join('<option value="%s">2026年%s</option>' % (m, m) for m in months)
    h = h[:first] + new + h[last:]
    report.append('月份下拉 %d → %s' % (len(opts), ','.join(months)))

# ── 4) 品牌文案（长的先替，避免「悦达」先命中把「悦 达」漏掉）──
for a, b in [('北斗-悦达', '逸品'), ('北斗 · 悦达', '逸品'), ('悦 达', '逸 品'), ('北 斗', '逸 品'),
             ('派驻公司：悦达', '派驻公司：逸品'), ('悦达', '逸品'), ('北斗', '逸品'),
             ('2026 · 马奎斯', '2026 · 祁坤'), ('第一对接人：马奎斯', '第一对接人：祁坤')]:
    n = h.count(a)
    if n: h = h.replace(a, b); report.append('文案 %s→%s ×%d' % (a, b, n))

# ── 5) 充值 / 商务收款：常量换成「月→数字」，另在页面末尾内联一段修正脚本兜底 ──
for var, key in (('PROD_RECHARGE', 'recharge'), ('BIZ_COLLECT', 'biz')):
    m3 = re.search(r'(?:const|let|var)\s+' + var + r'\s*=\s*', h)
    if not m3:
        continue
    e3 = h.find(';', m3.end())
    obj = {m: (cfg.get('kpiExtra') or {}).get(key, 0) for m, cfg in d.items()}
    h = h[:m3.end()] + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + h[e3:]
    report.append(var + ' → ' + json.dumps(obj, ensure_ascii=False))

_kpi = {m: (cfg.get('kpiExtra') or {}) for m, cfg in d.items()}
_fix = ("\n<script>\n/* 逸品数据注入：产品充值 / 商务收款两张卡（模板常量结构与本项目不同，这里按月直接写值）*/\n"
        "(function(){var K=" + json.dumps(_kpi, ensure_ascii=False, separators=(',', ':')) + ";\n"
        "function M2(n){return (n/1e6).toFixed(2)+'M';}\n"
        "function NUM(n){return Number(n).toLocaleString('en-US');}\n"
        "function set(id,v){var e=document.getElementById(id);if(e&&e.textContent!==v)e.textContent=v;}\n"
        "function fix(){var s=document.getElementById('monthSelector')||document.querySelector('select');\n"
        "var m=(s&&s.value)||Object.keys(K)[0];var e=K[m];if(!e)return;\n"
        "set('ovRechargeTotal', e.recharge>=1e6?M2(e.recharge):NUM(e.recharge));\n"
        "set('ovRechargeDesc','BI 充值合计 · 未设月度目标');\n"
        "set('ovCollectTotal', M2(e.biz));\n"
        "set('ovCollectDesc','目标'+M2(e.bizTarget)+' · 达成'+(e.biz/e.bizTarget*100).toFixed(1)+'%');}\n"
        "function burst(){[60,250,600,1200].forEach(function(t){setTimeout(fix,t);});}\n"
        "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',burst);else burst();\n"
        "document.addEventListener('change',burst,true);document.addEventListener('click',burst,true);\n"
        "})();\n</script>\n")
if '</body>' in h:
    h = h.replace('</body>', _fix + '</body>', 1)
    report.append('内联充值/商务收款修正脚本')

# 每日明细的产品下拉：只列该月 dailyData 里真实有逐日数据的项，避免选了空白
_dk = {m: list((cfg.get('dailyData') or {}).keys()) for m, cfg in d.items()}
_fix2 = ("\n<script>\n/* 每日明细：产品下拉按该月实际有逐日数据的项来填 */\n"
         "(function(){var DK=" + json.dumps(_dk, ensure_ascii=False, separators=(',', ':')) + ";\n"
         "function sync(){var ms=document.getElementById('monthSelector')||document.querySelector('select');\n"
         "var m=(ms&&ms.value)||Object.keys(DK)[0];var keys=DK[m]||[];\n"
         "var ps=document.getElementById('daily3ProductSelect');if(!ps||!keys.length)return;\n"
         "var cur=ps.value;var have=Array.prototype.map.call(ps.options,function(o){return o.value;});\n"
         "if(have.length===keys.length&&keys.every(function(k,i){return have[i]===k;}))return;\n"
         "ps.innerHTML=keys.map(function(k){return '<option value=\"'+k+'\">'+k+'</option>';}).join('');\n"
         "ps.value=keys.indexOf(cur)>=0?cur:keys[0];\n"
         "ps.dispatchEvent(new Event('change',{bubbles:true}));}\n"
         "function burst2(){[80,300,700,1400].forEach(function(t){setTimeout(sync,t);});}\n"
         "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',burst2);else burst2();\n"
         "document.addEventListener('change',function(e){if(e.target&&e.target.id==='daily3ProductSelect')return;burst2();},true);\n"
         "document.addEventListener('click',burst2,true);\n})();\n</script>\n")
if '</body>' in h:
    h = h.replace('</body>', _fix2 + '</body>', 1)
    report.append('内联每日明细产品下拉同步脚本')


# ── 5b) 数据对比页：默认区间锁到已有月份，并限制可选范围 ──
def _bounds(dd):
    ds = []
    for m, cfg in dd.items():
        mm = m.replace('月', '').zfill(2)
        for arr in (cfg.get('dailyData') or {}).values():
            for r in arr:
                ds.append('2026-' + str(r[0]))
    return (min(ds), max(ds)) if ds else (None, None)

lo, hi = _bounds(d)
if lo and hi:
    months = sorted(d.keys(), key=lambda k: int(k.replace('月', '')))
    def _mrange(m):
        mm = m.replace('月', '').zfill(2)
        got = sorted('2026-' + str(r[0]) for arr in (d[m].get('dailyData') or {}).values() for r in arr)
        return got[0], got[-1]
    aS, aE = _mrange(months[0])
    bS, bE = _mrange(months[-1]) if len(months) > 1 else (aS, aE)
    # 默认值：区间A=较早月全月，区间B=较晚月全月
    n_val = 0
    def _fix(mobj):
        global n_val
        tag = mobj.group(0)
        if 'type="date"' not in tag: return tag
        n_val += 1
        default = [aS, aE, bS, bE][(n_val - 1) % 4] if n_val <= 4 else None
        t = re.sub(r'\svalue="[^"]*"', '', tag)
        t = re.sub(r'\smin="[^"]*"', '', t)
        t = re.sub(r'\smax="[^"]*"', '', t)
        ins = ' min="%s" max="%s"' % (lo, hi)
        if default: ins += ' value="%s"' % default
        return t[:-1].rstrip() + ins + '>'
    h = re.sub(r'<input[^>]*type="date"[^>]*>', _fix, h)
    report.append('数据对比默认区间 → A %s~%s / B %s~%s，可选范围锁 %s~%s（共改 %d 个日期框）' % (aS, aE, bS, bE, lo, hi, n_val))

# ── 5c) 切断与北斗 Apps Script 的云端同步（投放策略页会拉到人家的策略文字）──
n_url = len(re.findall(r'https://script\.google\.com/macros/s/[\w-]+/exec', h))
if n_url:
    h = re.sub(r'https://script\.google\.com/macros/s/[\w-]+/exec', '', h)
    report.append('切断北斗云端同步 URL ×%d（投放策略改为本地填写，不再拉别人的数据）' % n_url)

# 清掉模板内嵌的策略默认文案（北斗产品名）
for _v in ('STRAT_L', 'STRAT_DEFAULT', 'DEFAULT_STRATEGY', 'STRATEGY_TEXT'):
    m2 = re.search(r'(?:const|let|var)\s+' + _v + r'\s*=\s*', h)
    if m2:
        e2 = h.find(';', m2.end())
        if e2 > 0:
            h = h[:m2.end()] + '{}' + h[e2:]
            report.append('清空模板内置策略文案 ' + _v)

# 安全清理：只清「= "....北斗产品名...."」这种整串赋值的默认文案，不碰 HTML 属性
BEIDOU_WORDS = ('51tiktok', '51推特', '51成人', '51动漫', '51品茶', '禁漫天堂', '萝莉岛',
                '海角乱伦', '暗网禁区', '抖阴Max', '91Pron', '91鬼父', '草榴社区',
                'AI色色', 'pornhub免费版', '91成人盒子')
def _blank_assign(mo):
    body = mo.group(3)
    return (mo.group(1) + mo.group(2) + mo.group(2)) if any(w in body for w in BEIDOU_WORDS) else mo.group(0)
before = h
h = re.sub(r'(=\s*)(["\'])((?:[^"\'\\\n]|\\.){1,300}?)\2', _blank_assign, h)
if h != before:
    report.append('清空含北斗产品名的默认文案（仅赋值语句）')

# ── 6) 拆掉运行时补丁引用（不再寄生）────────────────────
for tag in ('<script src="yipin-patch.js"></script>', "<script src='yipin-patch.js'></script>"):
    if tag in h: h = h.replace(tag, ''); report.append('移除 yipin-patch.js 引用')

# ── 7) 标题 & 更新时间 ───────────────────────────────────
h = re.sub(r'<title>[^<]*</title>', '<title>逸品 | 渠道管理工作台</title>', h)
stamp = datetime.datetime.utcnow() + datetime.timedelta(hours=8)
h = re.sub(r'(id="sidebarUpdateTime"[^>]*>)[^<]*', r'\g<1>' + stamp.strftime('%Y-%m-%d %H:%M'), h)

# ── 校验（防止把文件改坏）────────────────────────────────
for must in ('</html>', '</body>', 'monthConfigs', 'switchMonth',
             'kpiMinRate', 'kpiMaxRate', 'ovTargetTotal', 'ovBudgetTotal', 'monthSelector'):
    if must not in h: die('注入后缺少关键片段: ' + must)
for bad in ('悦达', '北斗', '马奎斯'):
    if bad in h: die('注入后仍残留「%s」，请检查替换规则' % bad)
for warn in ('51tiktok', '禁漫天堂', '萝莉岛', '51品茶'):
    if warn in h: print('⚠️ 仍含模板示例词「%s」（不拦截，请人工看一眼）' % warn)
if len(h) < orig_len * 0.2: die('注入后体积异常（%d → %d）' % (orig_len, len(h)))

io.open(HTML, 'w', encoding='utf-8').write(h)
print('✅ 注入完成 %d → %d 字符' % (orig_len, len(h)))
for r in report: print('   · ' + r)
