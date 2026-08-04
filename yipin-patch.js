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
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set('ovRechargeTotal', e.recharge >= 1e6 ? M2(e.recharge) : NUM(e.recharge));
    set('ovRechargeDesc', 'BI 充值合计 · 未设月度目标');
    set('ovCollectTotal', M2(e.biz));
    set('ovCollectDesc', '目标' + M2(e.bizTarget) + ' · 达成' + (e.biz / e.bizTarget * 100).toFixed(1) + '%');
  }

  function refresh() { fixText(); dedupBrand(); fixKpiCards(); }
  [200, 600, 1200, 2500].forEach(function (t) { setTimeout(refresh, t); });
  try {
    var mo = new MutationObserver(function () { clearTimeout(window.__yipinT); window.__yipinT = setTimeout(refresh, 80); });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  document.addEventListener('click', function () { setTimeout(refresh, 120); }, true);
  document.addEventListener('change', function () { setTimeout(refresh, 120); }, true);
})();
