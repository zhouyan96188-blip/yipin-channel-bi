/* 逸品数据注入补丁 —— 用 yipin_data.json 覆盖模板自带的北斗数据，其余结构/样式/交互完全不动 */
(function () {
  'use strict';
  function get(u) { var x = new XMLHttpRequest(); x.open('GET', u, false); x.send(); return x.responseText; }
  var d;
  try { d = JSON.parse(get('yipin_data.json')); } catch (e) { console.error('[逸品补丁] 数据载入失败', e); return; }

  // 1) 用逸品数据整体替换 monthConfigs（const 不能重赋值，但可以改属性）
  try {
    Object.keys(monthConfigs).forEach(function (k) { delete monthConfigs[k]; });
    Object.keys(d).forEach(function (k) { monthConfigs[k] = d[k]; });
  } catch (e) { console.error('[逸品补丁] monthConfigs 替换失败', e); }

  // 2) 订单流水清空（逸品订单明细未接入，避免残留模板数据）
  try { if (typeof orders !== 'undefined' && orders.length) orders.length = 0; } catch (e) {}
  try { if (typeof ordersJun !== 'undefined' && ordersJun.length) ordersJun.length = 0; } catch (e) {}
  try { if (typeof ordersJul !== 'undefined' && ordersJul.length) ordersJul.length = 0; } catch (e) {}

  // 3) 月份下拉改成 8月 / 7月
  function fixSel() {
    var s = document.getElementById('monthSelector') || document.querySelector('select');
    if (!s) return null;
    s.innerHTML = '<option value="8月">2026年8月</option><option value="7月">2026年7月</option>';
    s.value = '8月';
    return s;
  }

  // 4) 文案替换：只动文本节点，不碰 DOM 结构与事件
  var MAP = [['北斗-悦达', '逸品'], ['北斗 · 悦达', '逸品'], ['悦 达', '逸 品'], ['北 斗', '逸 品'],
             ['悦达', '逸品'], ['北斗', '逸品'], ['马奎斯', '祁坤']];
  function fixText(root) {
    var w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, null);
    var n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (t) {
      var v = t.nodeValue, o = v;
      MAP.forEach(function (m) { if (v.indexOf(m[0]) >= 0) v = v.split(m[0]).join(m[1]); });
      if (v !== o) t.nodeValue = v;
    });
    if (document.title.indexOf('北斗') >= 0 || document.title.indexOf('悦达') >= 0) {
      document.title = document.title.replace('北斗-悦达', '逸品').replace('北斗', '逸品').replace('悦达', '逸品');
    }
  }

  function dedupBrand() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      var v = n.nodeValue;
      if (/逸品\s*[·・]\s*逸品/.test(v)) n.nodeValue = v.replace(/逸品\s*[·・]\s*逸品/g, '逸品');
    }
  }

  function apply() {
    fixSel();
    try { if (typeof switchMonth === 'function') switchMonth('8月'); } catch (e) { console.error('[逸品补丁] switchMonth 失败', e); }
    fixText();
    dedupBrand();
    fixKpiCards();
    fixReview();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(apply, 60); });
  else setTimeout(apply, 60);
  // 页面内切月/重渲染后再刷一次文案
  // 5) 覆盖模板硬编码的「产品充值 / 商务收款」两张卡（模板里是北斗的常量，闭包内改不到，直接改 DOM）
  function fixKpiCards() {
    var sel = document.getElementById('monthSelector') || document.querySelector('select');
    var m = (sel && sel.value) || '8月';
    var e = (d[m] || {}).kpiExtra;
    if (!e) return;
    var M2 = function (n) { return (n / 1e6).toFixed(2) + 'M'; };
    var NUM = function (n) { return Number(n).toLocaleString('en-US'); };
    var set = function (id, v) { var el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
    set('ovRechargeTotal', e.recharge >= 1e6 ? M2(e.recharge) : NUM(e.recharge));
    set('ovRechargeDesc', 'BI 充值合计 · 未设月度目标');
    set('ovCollectTotal', M2(e.biz));
    set('ovCollectDesc', '目标' + M2(e.bizTarget) + ' · 达成' + (e.biz / e.bizTarget * 100).toFixed(1) + '%');
  }


  // 6) 月度复盘页：模板里是北斗手写的复盘文字（硬编码），按逸品数据重写
  function fixReview() {
    var pg = document.getElementById('page-review');
    if (!pg) return;
    var sel = document.getElementById('monthSelector') || document.querySelector('select');
    var m = (sel && sel.value) || '8月';
    var c = d[m]; if (!c) return;
    if (pg.getAttribute('data-yipin') === m) return;
    var P = c.products, e = c.kpiExtra || {};
    var N = function (n, f) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: f || 0, maximumFractionDigits: f || 0 }); };
    var M2 = function (n) { return (n / 1e6).toFixed(2) + 'M'; };
    var tgt = 0, act = 0, bgt = 0, csm = 0;
    P.forEach(function (p) { tgt += p.target; act += p.total; bgt += p.budget; csm += p.consume; });
    var days = m === '8月' ? 3 : 31, tp = +(days / 31 * 100).toFixed(2);
    var comp = act / tgt * 100, cons = csm / bgt * 100, cpa = csm / act;
    var top = P.slice().sort(function (a, b) { return b.completion - a.completion; }).slice(0, 5);
    var low = P.slice().sort(function (a, b) { return a.completion - b.completion; }).slice(0, 3);
    var hot = P.filter(function (p) { return p.budget > 0; }).sort(function (a, b) { return b.consumeRate - a.consumeRate; }).slice(0, 5);
    var pe = c.personalData.people.slice().sort(function (a, b) { return (b.expense / (b.actual || 1)) - (a.expense / (a.actual || 1)); });
    var hi = pe[0];
    var L = function (t) { return '<div style="margin:6px 0;line-height:1.9;font-size:13px">' + t + '</div>'; };
    var CARD = function (t, body) { return '<div class="card"><h3>' + t + '</h3>' + body + '</div>'; };
    var partial = m === '8月';
    pg.innerHTML =
      CARD('📌 一、目标达成总结',
        L('<b>' + (partial ? '本月截至 08-03（3/31 天，时间进度 ' + tp + '%）' : '7 月完整月') + '</b>，累计新增 <b>' + N(act) + '</b>，完成率 <b>' + comp.toFixed(2) + '%</b>' +
          (partial ? '，与时间进度 ' + tp + '% 基本同步。' : '，全月未达成 100% 目标。')) +
        L('<b>完成率前五</b>：' + top.map(function (p) { return p.name + ' ' + p.completion + '%'; }).join('、')) +
        L('<b>完成率垫底</b>：' + low.map(function (p) { return p.name + ' ' + p.completion + '%'; }).join('、') + '（性欲社预算为 0，本就无投放计划）')) +
      CARD('💰 二、预算与消耗',
        L('BI 投放消耗 <b>' + N(csm) + '</b> / 预算 ' + N(bgt) + '，消耗率 <b>' + cons.toFixed(2) + '%</b>' + (cons > 100 ? '（<span style="color:#f25c7a">已超预算</span>，BI 口径含 CPT 包月与结转，高于打款口径）' : '')) +
        L('平均 CPA <b>' + cpa.toFixed(2) + '</b>，产品充值 ' + N(e.recharge || 0) + '，充值 ROI ' + (csm ? ((e.recharge || 0) / csm).toFixed(3) : '—')) +
        L('<b>消耗率最高</b>：' + hot.map(function (p) { return p.name + ' ' + p.consumeRate + '%'; }).join('、'))) +
      CARD('👤 三、人员表现',
        L('<b>' + hi.name + ' CPA 最高</b>：消耗 ' + N(hi.expense) + '、新增 ' + N(hi.actual) + '，单位成本 ' + (hi.expense / (hi.actual || 1)).toFixed(2) + '，为团队均值 ' + cpa.toFixed(2) + ' 的 ' + ((hi.expense / (hi.actual || 1)) / cpa).toFixed(1) + ' 倍，建议优先排查。') +
        L(c.personalData.people.map(function (x) { return x.name + ' ' + x.completion + '%'; }).join(' &nbsp;·&nbsp; '))) +
      CARD('🧾 四、商务与结算',
        L('商务收款 <b>' + M2(e.biz || 0) + '</b> / 目标 ' + M2(e.bizTarget || 0) + '，达成 <b>' + ((e.biz || 0) / (e.bizTarget || 1) * 100).toFixed(2) + '%</b>') +
        L(partial
          ? '⚠️ 8 月结算严重滞后：结算表 59 行订单只有 8 笔填了请款日期，已打款 40,000 元，仅占 BI 消耗的 4.0%。月初属正常，月中需跟进兑付节奏。'
          : '7 月已结清，打款 9,241,414 元，占 BI 消耗 72.8%；差额来自 CPT 包月与跨月结转。')) +
      '<div class="card" style="border-left:3px solid var(--gold,#c9a84c)"><div style="font-size:12px;color:#8a93a6;line-height:1.8">数据来源：预算表「' + m + '」sheet（目标/预算/负责人）· BI 产品汇总（新增/消耗/充值）· 渠道结算明细-' + m + '（打款）· 商务月度目标。<br>口径：「实际消耗」为 BI 投放消耗，非打款口径；两个月同口径可比。</div></div>';
    pg.setAttribute('data-yipin', m);
  }

  function refresh() { fixText(); dedupBrand(); fixKpiCards(); fixReview(); }
  [200, 600, 1200, 2500].forEach(function (t) { setTimeout(refresh, t); });
  try {
    var mo = new MutationObserver(function () { clearTimeout(window.__yipinT); window.__yipinT = setTimeout(refresh, 80); });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  function refreshBurst() { var pg=document.getElementById('page-review'); if(pg) pg.removeAttribute('data-yipin'); [60, 200, 500, 1000].forEach(function (t) { setTimeout(refresh, t); }); }
  document.addEventListener('click', refreshBurst, true);
  document.addEventListener('change', refreshBurst, true);
  // 模板的 switchMonth 会重渲染整页，包一层确保之后补刷
  try {
    if (typeof switchMonth === 'function') {
      var _sm = switchMonth;
      window.switchMonth = function () { var r = _sm.apply(this, arguments); refreshBurst(); return r; };
    }
  } catch (e) {}
})();
