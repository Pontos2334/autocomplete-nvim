export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>补全审计面板</title>
<style>
:root {
  --bg-root: #ffffff;
  --bg-surface: #f8f9fb;
  --bg-elevated: #f1f3f7;
  --bg-inset: #eceef3;
  --border: #e2e5eb;
  --border-focus: #c7ccd6;
  --text-primary: #1a1d26;
  --text-secondary: #555b6e;
  --text-muted: #8b91a0;
  --accent: #4f6ef7;
  --accent-dim: rgba(79,110,247,.08);
  --green: #1a9e56;
  --green-dim: rgba(26,158,86,.08);
  --orange: #c67622;
  --orange-dim: rgba(198,118,34,.08);
  --red: #d43838;
  --red-dim: rgba(212,56,56,.06);
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body { background: var(--bg-root); color: var(--text-primary); font-family: var(--font-body); font-size: 14px; line-height: 1.6; }

.dashboard {
  display: grid;
  grid-template-columns: 380px 1fr;
  grid-template-rows: 48px 1fr;
  height: 100vh;
  overflow: hidden;
}

.dash-header {
  grid-column: 1 / -1;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}
.dash-logo { display: flex; align-items: center; gap: 10px; }
.dash-logo-icon {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 14px; font-family: var(--font-mono);
}
.dash-logo-text { font-family: var(--font-mono); font-size: 13px; color: var(--text-secondary); letter-spacing: .5px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); transition: background .3s; }
.status-dot.error { background: var(--red); }
.dash-stats { display: flex; gap: 8px; }
.stat-chip {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);
  background: var(--bg-inset); border: 1px solid var(--border); border-radius: 20px;
  padding: 3px 10px;
}
.btn-sm {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px;
  padding: 4px 12px; cursor: pointer; transition: all .15s;
}
.btn-sm:hover { border-color: var(--border-focus); color: var(--text-primary); }

.request-list {
  grid-column: 1;
  display: flex; flex-direction: column;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
}
.filter-bar { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.filter-tab {
  font-family: var(--font-body); font-size: 11px;
  color: var(--text-muted); background: none; border: 1px solid transparent;
  border-radius: 4px; padding: 4px 10px; cursor: pointer; transition: all .15s;
}
.filter-tab:hover { color: var(--text-secondary); background: var(--bg-elevated); }
.filter-tab.active { color: var(--accent); background: var(--accent-dim); border-color: rgba(79,110,247,.25); }
.request-rows { flex: 1; overflow-y: auto; }
.request-rows::-webkit-scrollbar { width: 5px; }
.request-rows::-webkit-scrollbar-track { background: transparent; }
.request-rows::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

.request-row {
  padding: 10px 14px; border-bottom: 1px solid var(--border);
  border-left: 2px solid transparent; cursor: pointer; transition: background .15s, border-color .15s;
  animation: rowSlideIn .25s ease-out;
}
.request-row:hover { background: var(--bg-elevated); }
.request-row.selected { background: rgba(79,110,247,.06); border-left-color: var(--accent); }
.row-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.row-time { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
.row-file { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-status { display: flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 11px; }
.row-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.row-status-dot.green { background: var(--green); }
.row-status-dot.orange { background: var(--orange); }
.row-status-dot.red { background: var(--red); }
.row-status-dot.blue { background: var(--accent); animation: pulse 1.5s ease-in-out infinite; }
.row-bottom { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
.row-badge {
  display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600;
}
.row-badge.cache { background: var(--green-dim); color: var(--green); }
.row-badge.multi { background: var(--accent-dim); color: var(--accent); }
.row-badge.filtered { background: var(--orange-dim); color: var(--orange); }

/* FIX: 右侧面板滚动 — min-height:0 让 flex 子元素能正确收缩 */
.request-detail { grid-column: 2; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.detail-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
}
.empty-icon { font-family: var(--font-mono); font-size: 28px; color: var(--text-muted); opacity: .4; }
.empty-title { font-family: var(--font-body); font-size: 16px; color: var(--text-muted); }
.empty-sub { font-size: 13px; color: var(--text-muted); text-align: center; max-width: 320px; line-height: 1.6; }

.detail-tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--bg-surface); padding: 0 16px; flex-shrink: 0; }
.tab-btn {
  font-family: var(--font-body); font-size: 12px;
  color: var(--text-muted);
  background: none; border: none; border-bottom: 2px solid transparent;
  padding: 12px 14px; cursor: pointer; transition: all .15s;
}
.tab-btn:hover { color: var(--text-secondary); }
.tab-btn.active { color: var(--text-primary); border-bottom-color: var(--accent); }
/* FIX: tab-panels 需要正确的 overflow + min-height */
.tab-panels { flex: 1; overflow-y: auto; min-height: 0; }
.tab-panels::-webkit-scrollbar { width: 5px; }
.tab-panels::-webkit-scrollbar-track { background: transparent; }
.tab-panels::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.tab-panel { display: none; padding: 20px; animation: fadeIn .15s ease-out; }
.tab-panel.active { display: block; }

.section { background: var(--bg-elevated); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.section-title { font-family: var(--font-body); font-size: 11px; letter-spacing: .5px; color: var(--text-muted); margin-bottom: 12px; }

.timeline { display: flex; align-items: flex-start; justify-content: space-between; position: relative; padding: 0 8px; flex-wrap: wrap; gap: 8px; }
.tl-step { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 60px; }
.tl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); opacity: .4; }
.tl-dot.done { background: var(--green); opacity: 1; }
.tl-dot.fail { background: var(--red); opacity: 1; }
.tl-dot.active { background: var(--accent); opacity: 1; animation: pulse 1.5s ease-in-out infinite; }
.tl-label { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .3px; text-align: center; }
.tl-time { font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); }
.tl-delta { font-family: var(--font-mono); font-size: 9px; color: var(--accent); }

.params-grid { display: grid; grid-template-columns: 120px 1fr; gap: 6px 16px; }
.param-key { font-family: var(--font-body); font-size: 12px; color: var(--text-muted); }
.param-val { font-family: var(--font-mono); font-size: 12px; color: var(--text-primary); word-break: break-all; }
.param-val .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; }
.badge-on { background: var(--green-dim); color: var(--green); }
.badge-off { background: var(--bg-inset); color: var(--text-muted); }

.code-block {
  background: var(--bg-inset); border: 1px solid var(--border); border-radius: 6px;
  overflow: hidden; margin-bottom: 12px;
}
.code-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; background: var(--bg-elevated);
  font-family: var(--font-body); font-size: 11px;
  color: var(--text-secondary);
}
.code-header .copy-btn {
  font-size: 10px; color: var(--text-muted); background: none; border: 1px solid var(--border);
  border-radius: 3px; padding: 2px 8px; cursor: pointer; transition: all .15s;
}
.code-header .copy-btn:hover { color: var(--text-primary); border-color: var(--border-focus); }
.code-body {
  padding: 10px 14px; font-family: var(--font-mono); font-size: 12px; line-height: 1.65;
  white-space: pre-wrap; word-break: break-all;
  max-height: 400px; overflow-y: auto;
}
.code-body::-webkit-scrollbar { width: 5px; }
.code-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

.error-block { background: var(--red-dim); border-left: 2px solid var(--red); border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 16px; }
.error-type { font-family: var(--font-mono); font-size: 14px; font-weight: 600; color: var(--red); }
.error-msg { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }

.filter-block { background: var(--orange-dim); border-left: 2px solid var(--orange); border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 16px; }
.filter-type { font-family: var(--font-mono); font-size: 14px; font-weight: 600; color: var(--orange); }

.json-body {
  padding: 12px; background: var(--bg-inset);
  font-family: var(--font-mono); font-size: 12px; line-height: 1.65;
  white-space: pre-wrap; word-break: break-all;
  max-height: 600px; overflow-y: auto;
}
.json-body::-webkit-scrollbar { width: 5px; }
.json-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.jk { color: var(--text-secondary); }
.js { color: var(--green); }
.jn { color: var(--orange); }
.jb { color: #7048c8; }

.toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
.toast {
  background: var(--bg-root); border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 16px; font-size: 13px; color: var(--text-secondary);
  animation: toastIn .3s ease-out; box-shadow: 0 4px 12px rgba(0,0,0,.1);
}
.toast.out { animation: toastOut .3s ease-in forwards; }
.conn-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 999;
  background: var(--red-dim); border-bottom: 1px solid var(--red);
  padding: 8px 16px; text-align: center;
  font-family: var(--font-mono); font-size: 12px; color: var(--red);
  display: none;
}

@keyframes rowSlideIn { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
@keyframes toastIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes toastOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(20px); } }

@media (max-width: 900px) {
  .dashboard { grid-template-columns: 1fr; grid-template-rows: 48px 40vh 60vh; }
  .request-list { grid-column: 1; border-right: none; border-bottom: 1px solid var(--border); }
  .request-detail { grid-column: 1; }
}

/* Demo / FIM Tester */
.demo-split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.demo-input, .demo-output { display: flex; flex-direction: column; gap: 12px; }
.demo-card { background: var(--bg-elevated); border-radius: 8px; border: 1px solid var(--border); overflow: hidden; }
.demo-card-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-surface); border-bottom: 1px solid var(--border); }
.demo-card-title { font-family: var(--font-body); font-size: 12px; font-weight: 700; color: var(--text-secondary); }
.demo-card-note { font-size: 11px; color: var(--text-muted); }
.demo-textarea {
  width: 100%; border: none; outline: none; resize: vertical; padding: 10px 12px;
  font-family: var(--font-mono); font-size: 12px; line-height: 1.55; background: var(--bg-inset); color: var(--text-primary);
}
.demo-textarea.code-editor { min-height: 320px; background: #1e2030; color: #e0e4f0; }
.demo-textarea.comp-input { min-height: 80px; }
.demo-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 10px 12px; }
.demo-metric { text-align: center; }
.demo-metric-label { font-size: 10px; color: var(--text-muted); }
.demo-metric-value { font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--text-primary); }
.demo-pre { margin: 0; padding: 10px 12px; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; background: var(--bg-inset); color: var(--text-primary); }
.demo-pre::-webkit-scrollbar { width: 5px; }
.demo-pre::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.demo-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.demo-field { display: flex; align-items: center; gap: 6px; }
.demo-field label { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.demo-field input { width: 70px; height: 28px; border: 1px solid var(--border); border-radius: 4px; padding: 0 6px; font-family: var(--font-mono); font-size: 11px; background: #fff; color: var(--text-primary); }
.demo-btn { height: 28px; border: 1px solid var(--border); border-radius: 4px; padding: 0 10px; font-size: 11px; font-weight: 700; cursor: pointer; background: var(--bg-elevated); color: var(--text-secondary); transition: all .15s; }
.demo-btn:hover { border-color: var(--border-focus); color: var(--text-primary); }
.demo-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.demo-btn.primary:hover { opacity: .85; }
.demo-btn.danger { color: var(--red); border-color: rgba(212,56,56,.3); }
.demo-btn:disabled { opacity: .5; cursor: not-allowed; }
.demo-status-bar { display: flex; gap: 8px; padding: 8px 12px; flex-wrap: wrap; }
.demo-pill { font-family: var(--font-mono); font-size: 10px; padding: 3px 8px; border-radius: 12px; border: 1px solid var(--border); color: var(--text-muted); background: var(--bg-inset); }
.demo-pill.good { border-color: rgba(26,158,86,.25); color: var(--green); background: var(--green-dim); }
.demo-pill.warn { border-color: rgba(198,118,34,.25); color: var(--orange); background: var(--orange-dim); }
.demo-checks { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; }
.demo-check { display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 11px; }
.demo-check code { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.demo-check-pass { padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.demo-check-pass.yes { background: var(--green-dim); color: var(--green); }
.demo-check-pass.no { background: var(--red-dim); color: var(--red); }
.demo-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px 12px; }
.demo-block { }
.demo-block-label { font-size: 10px; color: var(--text-muted); margin-bottom: 4px; }
</style>
</head>
<body>

<div id="connBanner" class="conn-banner">连接断开，正在重连...</div>

<div class="dashboard">
  <header class="dash-header">
    <div class="dash-logo">
      <div class="dash-logo-icon">A</div>
      <span class="dash-logo-text">补全审计面板</span>
      <div class="status-dot" id="statusDot"></div>
    </div>
    <div class="dash-stats">
      <span class="stat-chip" id="callCount">0 次调用</span>
      <span class="stat-chip" id="cacheRate">缓存: -</span>
    </div>
    <button class="btn-sm" id="clearBtn">清空</button>
  </header>

  <aside class="request-list">
    <div class="filter-bar">
      <button class="filter-tab active" data-filter="all">全部</button>
      <button class="filter-tab" data-filter="completed">完成</button>
      <button class="filter-tab" data-filter="filtered">已过滤</button>
      <button class="filter-tab" data-filter="error">错误</button>
    </div>
    <div class="request-rows" id="requestRows"></div>
  </aside>

  <main class="request-detail">
    <div class="detail-empty" id="detailEmpty">
      <div class="empty-icon">[A]</div>
      <div class="empty-title">选择一个请求</div>
      <div class="empty-sub">从左侧列表点击一个请求，查看 Prompt、补全结果和耗时详情。</div>
    </div>
    <div id="detailContent" style="display:none">
      <nav class="detail-tabs" id="detailTabs">
        <button class="tab-btn active" data-tab="overview">概览</button>
        <button class="tab-btn" data-tab="prompt">Prompt</button>
        <button class="tab-btn" data-tab="prefix">前缀</button>
        <button class="tab-btn" data-tab="suffix">后缀</button>
        <button class="tab-btn" data-tab="completion">补全结果</button>
        <button class="tab-btn" data-tab="raw">原始数据</button>
        <button class="tab-btn" data-tab="demo">FIM 测试</button>
      </nav>
      <div class="tab-panels">
        <section class="tab-panel active" id="panel-overview"></section>
        <section class="tab-panel" id="panel-prompt"></section>
        <section class="tab-panel" id="panel-prefix"></section>
        <section class="tab-panel" id="panel-suffix"></section>
        <section class="tab-panel" id="panel-completion"></section>
        <section class="tab-panel" id="panel-raw"></section>
        <section class="tab-panel" id="panel-demo"></section>
      </div>
    </div>
  </main>
</div>

<div class="toast-container" id="toastContainer"></div>

<script>
var state = {
  records: [],
  selectedId: null,
  selectedDetail: null,
  activeTab: 'overview',
  activeFilter: 'all',
  totalCalls: 0,
  cacheHits: 0,
  sse: null,
};

function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtMs(ms) { if (ms == null) return '-'; return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'; }
function fmtTime(ts) { if (!ts) return '-'; var d = new Date(ts); return d.toLocaleTimeString(); }
function fmtDelta(a, b) { if (!a || !b) return ''; return '+' + fmtMs(b - a); }
function getStatusDot(r) {
  if (r.status === 'completed') return 'green';
  if (r.status === 'error') return 'red';
  if (r.status === 'filtered') return 'orange';
  if (r.status === 'cancelled') return 'orange';
  return 'blue';
}
function toast(msg) {
  var c = document.getElementById('toastContainer');
  var t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  c.appendChild(t);
  setTimeout(function() { t.classList.add('out'); setTimeout(function() { t.remove(); }, 300); }, 2000);
}
function copyText(text) { navigator.clipboard.writeText(text).then(function() { toast('已复制'); }).catch(function() {}); }
function syntaxHighlight(obj) {
  var json = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(
    new RegExp('("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*")(\\s*:)?', 'g'),
    function(match, str, _, colonSuffix) {
      if (colonSuffix) return '<span class="jk">' + str + '</span>:';
      return '<span class="js">' + str + '</span>';
    }
  ).replace(
    new RegExp('\\b(true|false|null)\\b', 'g'),
    '<span class="jb">$1</span>'
  ).replace(
    new RegExp('(-?\\d+(\\.\\d+)?([eE][+-]?\\d+)?)', 'g'),
    '<span class="jn">$1</span>'
  );
}

// SSE
function connectSSE() {
  if (state.sse) state.sse.close();
  var es = new EventSource('/audit/api/events');
  es.onopen = function() { document.getElementById('statusDot').classList.remove('error'); document.getElementById('connBanner').style.display = 'none'; };
  es.onmessage = function(e) {
    try {
      var data = JSON.parse(e.data);
      if (data.type === 'audit.record_completed' && data.record) {
        state.records.unshift(data.record);
        state.totalCalls++;
        if (data.record.cacheHit) state.cacheHits++;
        updateStats(); renderList();
      }
    } catch(ex) {}
  };
  es.onerror = function() { document.getElementById('statusDot').classList.add('error'); document.getElementById('connBanner').style.display = 'block'; setTimeout(connectSSE, 3000); };
  state.sse = es;
}

function fetchRecords() {
  fetch('/audit/api/records?limit=100').then(function(res) { return res.json(); }).then(function(data) {
    state.records = data.records || [];
    state.totalCalls = data.total || state.records.length;
    state.cacheHits = state.records.filter(function(r) { return r.cacheHit; }).length;
    renderList(); updateStats();
  }).catch(function(e) { console.error('获取记录失败:', e); });
}

function fetchDetail(id) {
  fetch('/audit/api/records/' + id).then(function(res) {
    if (res.ok) return res.json();
  }).then(function(data) {
    if (data) { state.selectedDetail = data; renderDetail(); }
  }).catch(function(e) { console.error('获取详情失败:', e); });
}

function updateStats() {
  document.getElementById('callCount').textContent = state.totalCalls + ' 次调用';
  var rate = state.totalCalls > 0 ? Math.round(state.cacheHits / state.totalCalls * 100) : 0;
  document.getElementById('cacheRate').textContent = '缓存: ' + rate + '%';
}

function renderList() {
  var c = document.getElementById('requestRows');
  var filtered = state.records;
  if (state.activeFilter === 'completed') filtered = filtered.filter(function(r) { return r.status === 'completed'; });
  else if (state.activeFilter === 'filtered') filtered = filtered.filter(function(r) { return r.status === 'filtered' || r.status === 'cancelled'; });
  else if (state.activeFilter === 'error') filtered = filtered.filter(function(r) { return r.status === 'error'; });

  c.innerHTML = filtered.map(function(r) {
    var dot = getStatusDot(r);
    var fname = r.filename || r.filepath.split('/').pop() || '';
    return '<div class="request-row' + (r.id === state.selectedId ? ' selected' : '') + '" data-id="' + r.id + '">' +
      '<div class="row-top">' +
        '<span class="row-time">' + fmtTime(r.receivedAt) + '</span>' +
        '<span class="row-file" title="' + esc(r.filepath) + '">' + esc(fname) + ':' + r.line + '</span>' +
        '<span class="row-status"><span class="row-status-dot ' + dot + '"></span></span>' +
      '</div>' +
      '<div class="row-bottom">' +
        '<span>' + esc(r.modelName || '') + '</span>' +
        '<span>' + fmtMs(r.durationMs) + '</span>' +
        '<span>' + (r.numLines || 0) + '行</span>' +
        (r.cacheHit ? '<span class="row-badge cache">缓存</span>' : '') +
        (r.reuseHit ? '<span class="row-badge cache">复用</span>' : '') +
        (r.isMultiline ? '<span class="row-badge multi">多行</span>' : '') +
        (r.filterReason ? '<span class="row-badge filtered">' + esc(r.filterReason) + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  c.querySelectorAll('.request-row').forEach(function(el) {
    el.addEventListener('click', function() {
      state.selectedId = el.dataset.id;
      renderList();
      fetchDetail(state.selectedId);
    });
  });
}

function renderDetail() {
  var r = state.selectedDetail;
  if (!r) return;
  document.getElementById('detailEmpty').style.display = 'none';
  document.getElementById('detailContent').style.display = '';

  renderOverview(r);
  renderPrompt(r);
  renderPrefix(r);
  renderSuffix(r);
  renderCompletion(r);
  renderRaw(r);
}

function renderOverview(r) {
  var t = r.timing || {};
  var steps = [
    { label: '请求', at: t.requestStartAt },
    { label: 'Prompt', at: t.promptRenderedAt },
    { label: 'LLM 开始', at: t.llmCallStartAt },
    { label: '首包', at: t.firstChunkAt },
    { label: 'LLM 结束', at: t.llmCallEndAt },
    { label: '完成', at: t.completedAt || r.completedAt },
  ];

  var tlHtml = '<div class="timeline">';
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var done = s.at != null;
    var delta = done && i > 0 && steps[i-1].at ? fmtDelta(steps[i-1].at, s.at) : '';
    tlHtml += '<div class="tl-step">' +
      '<div class="tl-dot ' + (done ? (r.status === 'error' ? 'fail' : 'done') : '') + '"></div>' +
      '<div class="tl-label">' + s.label + '</div>' +
      (done ? '<div class="tl-time">' + fmtTime(s.at) + '</div>' : '') +
      (delta ? '<div class="tl-delta">' + delta + '</div>' : '') +
    '</div>';
  }
  tlHtml += '</div>';

  var paramsHtml = '<div class="params-grid">' +
    kv('文件', esc(r.filename) + ':' + r.line + ':' + r.character) +
    kv('语言', esc(r.language)) +
    kv('模型', esc(r.modelProvider) + '/' + esc(r.modelName)) +
    kv('API 地址', esc(r.apiBase)) +
    kv('耗时', fmtMs(r.durationMs)) +
    kv('行数', r.numLines) +
    kv('分块数', r.chunkCount) +
    kv('缓存', badge(r.cacheHit, '命中', '未命中')) +
    kv('复用', badge(r.reuseHit, '命中', '未命中')) +
    kv('复用原因', esc(r.reuseReason || '-')) +
    kv('多行', badge(r.isMultiline)) +
    kv('手动触发', badge(r.manuallyTriggered)) +
    kv('软超时返回', badge(r.partialReturned || r.previewOnly)) +
    kv('超时', badge(r.timedOut)) +
  '</div>';

  var snip = r.snippetSummary;
  var snipHtml = '';
  if (snip) {
    snipHtml = '<div class="params-grid">' +
      kv('根路径', snip.rootPath) +
      kv('导入', snip.imports) +
      kv('IDE/LSP', snip.ide) +
      kv('编辑范围', snip.edited) +
      kv('已打开', snip.opened) +
    '</div>';
  }

  var content = '';
  if (r.error) {
    content += '<div class="error-block"><div class="error-type">' + esc(r.error.type) + '</div><div class="error-msg">' + esc(r.error.message) + '</div></div>';
  }
  if (r.filterReason) {
    content += '<div class="filter-block"><div class="filter-type">过滤原因: ' + esc(r.filterReason) + '</div></div>';
  }
  content += section('时间线', tlHtml);
  content += section('参数', paramsHtml);
  if (snipHtml) content += section('上下文片段', snipHtml);

  document.getElementById('panel-overview').innerHTML = content;
}

function renderPrompt(r) {
  var html = '';
  html += codeBlock('完整 Prompt (' + (r.prompt || '').length + ' 字符)', r.prompt, 'prompt-full');
  document.getElementById('panel-prompt').innerHTML = html;
  bindCopyButtons();
}

function renderPrefix(r) {
  var html = '';
  html += codeBlock('Prefix / 前缀 (' + (r.prefix || '').length + ' 字符)', r.prefix, 'prompt-prefix');
  document.getElementById('panel-prefix').innerHTML = html;
  bindCopyButtons();
}

function renderSuffix(r) {
  var html = '';
  html += codeBlock('Suffix / 后缀 (' + (r.suffix || '').length + ' 字符)', r.suffix, 'prompt-suffix');
  document.getElementById('panel-suffix').innerHTML = html;
  bindCopyButtons();
}

function renderCompletion(r) {
  var html = '';
  if (r.error) {
    html += '<div class="error-block"><div class="error-type">' + esc(r.error.type) + '</div><div class="error-msg">' + esc(r.error.message) + '</div></div>';
  }
  if (r.filterReason) {
    html += '<div class="filter-block"><div class="filter-type">过滤原因: ' + esc(r.filterReason) + '</div></div>';
  }
  html += codeBlock('LLM 原始输出 (' + (r.completion || '').length + ' 字符)', r.completion, 'comp-raw');
  if (r.processedCompletion !== undefined) {
    html += codeBlock('后处理结果 (' + (r.processedCompletion || '').length + ' 字符)', r.processedCompletion, 'comp-processed');
  }
  if (r.displayedCompletion !== undefined) {
    html += codeBlock('最终显示 (' + (r.displayedCompletion || '').length + ' 字符)', r.displayedCompletion, 'comp-displayed');
  }
  if (r.completionOptions) {
    html += codeBlock('补全参数', JSON.stringify(r.completionOptions, null, 2), 'comp-options');
  }
  document.getElementById('panel-completion').innerHTML = html;
  bindCopyButtons();
}

function renderRaw(r) {
  document.getElementById('panel-raw').innerHTML = '<div class="json-body">' + syntaxHighlight(r) + '</div>';
}

function section(title, content) {
  return '<div class="section"><div class="section-title">' + title + '</div>' + content + '</div>';
}

function kv(key, val) {
  return '<span class="param-key">' + key + '</span><span class="param-val">' + val + '</span>';
}

function badge(on, trueText, falseText) {
  if (on) return '<span class="badge badge-on">' + (trueText || '是') + '</span>';
  return '<span class="badge badge-off">' + (falseText || '否') + '</span>';
}

function codeBlock(title, content, id) {
  return '<div class="code-block">' +
    '<div class="code-header">' +
      '<span>' + esc(title) + '</span>' +
      '<button class="copy-btn" data-copy-target="' + id + '">复制</button>' +
    '</div>' +
    '<pre class="code-body" id="' + id + '">' + esc(content || '') + '</pre>' +
  '</div>';
}

function bindCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.onclick = function() {
      var target = document.getElementById(btn.dataset.copyTarget);
      if (target) copyText(target.textContent);
    };
  });
}

// 筛选标签
document.querySelectorAll('.filter-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    state.activeFilter = tab.dataset.filter;
    renderList();
  });
});

// 详情标签页
document.querySelectorAll('.tab-btn').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    state.activeTab = tab.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('panel-' + state.activeTab).classList.add('active');
  });
});

// 清空
document.getElementById('clearBtn').addEventListener('click', function() {
  fetch('/audit/api/records', { method: 'DELETE' }).then(function() {
    state.records = []; state.totalCalls = 0; state.cacheHits = 0;
    state.selectedId = null; state.selectedDetail = null;
    renderList(); updateStats();
    document.getElementById('detailEmpty').style.display = '';
    document.getElementById('detailContent').style.display = 'none';
    toast('已清空');
  });
});

// ============ Demo / FIM Tester ============
var demoState = {
  config: null,
  realCompletion: '',
  abortController: null,
  inited: false,
};

var defaultDemoSource = [
  '// error handler',
  'app.use(function (err, req, res, next) {',
  '  // set locals, only providing error in development',
  '  res.locals.message = err.message;',
  '  res.locals.error = req.app.get("env") === "development" ? err : {};',
  '',
  '  // render the error page',
  '  res.status(err.status || 500);',
  '  res.render("error");',
  '});',
  '',
  'app.listen(30001, () => { })',
  '',
  'module.exports = app;',
].join('\\n');
var defaultDemoCompletion = 'app.listen(30001, () => { })\\n\\nmodule.exports = app;';

function initDemoPanel() {
  if (demoState.inited) return;
  demoState.inited = true;
  var panel = document.getElementById('panel-demo');
  panel.innerHTML =
    '<div class="demo-status-bar">' +
      '<span class="demo-pill" id="demoServerStatus">正在读取模型配置...</span>' +
      '<span class="demo-pill" id="demoRequestStatus">空闲</span>' +
    '</div>' +
    '<div style="padding:0 12px 12px">' +
    '<div class="demo-split">' +
      '<div class="demo-input">' +
        '<div class="demo-card">' +
          '<div class="demo-card-head"><span class="demo-card-title">可编辑源码</span><span class="demo-card-note">textarea 光标 = 测试光标</span></div>' +
          '<div class="demo-toolbar">' +
            '<div class="demo-field"><label>行号</label><input id="demoLine" type="number" min="1" step="1"></div>' +
            '<div class="demo-field"><label>列</label><input id="demoChar" type="number" min="0" step="1"></div>' +
            '<button class="demo-btn" id="demoReset">恢复示例</button>' +
          '</div>' +
          '<textarea class="demo-textarea code-editor" id="demoCode" spellcheck="false"></textarea>' +
        '</div>' +
        '<div class="demo-card">' +
          '<div class="demo-card-head"><span class="demo-card-title">模拟补全文本</span><span class="demo-card-note">可手动编辑</span></div>' +
          '<textarea class="demo-textarea comp-input" id="demoSimCompletion" spellcheck="false"></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="demo-output">' +
        '<div class="demo-card">' +
          '<div class="demo-card-head"><span class="demo-card-title">实时上下文</span></div>' +
          '<div class="demo-metrics">' +
            '<div class="demo-metric"><div class="demo-metric-label">光标偏移</div><div class="demo-metric-value" id="demoOffset">0</div></div>' +
            '<div class="demo-metric"><div class="demo-metric-label">光标位置</div><div class="demo-metric-value" id="demoCursor">1:0</div></div>' +
            '<div class="demo-metric"><div class="demo-metric-label">Prefix 字符</div><div class="demo-metric-value" id="demoPrefixLen">0</div></div>' +
            '<div class="demo-metric"><div class="demo-metric-label">Suffix 字符</div><div class="demo-metric-value" id="demoSuffixLen">0</div></div>' +
          '</div>' +
          '<div class="demo-grid2">' +
            '<div class="demo-block"><div class="demo-block-label">Prefix</div><pre class="demo-pre" id="demoPrefixOut"></pre></div>' +
            '<div class="demo-block"><div class="demo-block-label">Suffix</div><pre class="demo-pre" id="demoSuffixOut"></pre></div>' +
          '</div>' +
          '<div class="demo-checks" id="demoChecks"></div>' +
        '</div>' +
        '<div class="demo-card">' +
          '<div class="demo-card-head"><span class="demo-card-title">真实 FIM 请求</span><span class="demo-card-note">通过 audit server 代理，不暴露 API Key</span></div>' +
          '<div class="demo-toolbar">' +
            '<div class="demo-field"><label>max_tokens</label><input id="demoMaxTokens" type="number" value="128" min="1" max="4096"></div>' +
            '<div class="demo-field"><label>temperature</label><input id="demoTemp" type="number" value="0.01" min="0" max="2" step="0.01"></div>' +
            '<button class="demo-btn primary" id="demoRun">运行 FIM</button>' +
            '<button class="demo-btn danger" id="demoStop" disabled>停止</button>' +
          '</div>' +
          '<div style="padding:10px 12px">' +
            '<div class="demo-block-label">模型输出</div>' +
            '<pre class="demo-pre" id="demoRealOutput" style="min-height:100px"></pre>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '</div>';

  var codeEl = document.getElementById('demoCode');
  ['input','click','keyup','select'].forEach(function(ev) { codeEl.addEventListener(ev, demoRenderAll); });
  document.getElementById('demoSimCompletion').addEventListener('input', demoRenderAll);
  document.getElementById('demoMaxTokens').addEventListener('input', demoRenderAll);
  document.getElementById('demoTemp').addEventListener('input', demoRenderAll);
  document.getElementById('demoLine').addEventListener('change', demoMoveCursor);
  document.getElementById('demoChar').addEventListener('change', demoMoveCursor);
  document.getElementById('demoReset').addEventListener('click', demoResetExample);
  document.getElementById('demoRun').addEventListener('click', demoRunFim);
  document.getElementById('demoStop').addEventListener('click', function() { if (demoState.abortController) demoState.abortController.abort(); });

  demoResetExample();
  demoLoadConfig();
}

function demoGetContext() {
  var code = document.getElementById('demoCode');
  var text = code.value;
  var lines = text.split('\\n');
  var selStart = code.selectionStart || 0;
  var before = text.slice(0, selStart);
  var beforeLines = before.split('\\n');
  var lineIdx = beforeLines.length - 1;
  var charIdx = beforeLines[beforeLines.length - 1].length;
  return { text: text, lines: lines, lineIdx: lineIdx, charIdx: charIdx, prefix: before, suffix: text.slice(selStart) };
}

function demoRenderAll() {
  var ctx = demoGetContext();
  var simText = document.getElementById('demoSimCompletion').value;
  var simTransform = demoRunTransform(ctx.lines, ctx.lineIdx, ctx.suffix, simText);
  var realTransform = demoRunTransform(ctx.lines, ctx.lineIdx, ctx.suffix, demoState.realCompletion);
  var simDedupe = demoRunDedupe(ctx.lines, ctx.lineIdx, simTransform.output);
  var realDedupe = demoRunDedupe(ctx.lines, ctx.lineIdx, realTransform.output);
  if (document.activeElement !== document.getElementById('demoLine'))
    document.getElementById('demoLine').value = String(ctx.lineIdx + 1);
  if (document.activeElement !== document.getElementById('demoChar'))
    document.getElementById('demoChar').value = String(ctx.charIdx);
  document.getElementById('demoOffset').textContent = String(ctx.prefix.length);
  document.getElementById('demoCursor').textContent = (ctx.lineIdx+1) + ':' + ctx.charIdx;
  document.getElementById('demoPrefixLen').textContent = String(ctx.prefix.length);
  document.getElementById('demoSuffixLen').textContent = String(ctx.suffix.length);
  document.getElementById('demoPrefixOut').textContent = ctx.prefix;
  document.getElementById('demoSuffixOut').textContent = ctx.suffix;
  document.getElementById('demoRealOutput').textContent = demoState.realCompletion || '(尚无输出)';
  var checksEl = document.getElementById('demoChecks');
  checksEl.innerHTML = '';
  checksEl.appendChild(demoMakeCheck('suffix 包含 app.listen', ctx.suffix.includes('app.listen')));
  checksEl.appendChild(demoMakeCheck('suffix 包含 module.exports', ctx.suffix.includes('module.exports')));
  checksEl.appendChild(demoMakeCheck('模拟输出被 transform 截断为空', simTransform.output.trim().length === 0));
  checksEl.appendChild(demoMakeCheck('模拟去重后 ' + simDedupe.linesToKeep + '/' + simDedupe.originalLines + ' 行', simDedupe.linesToKeep < simDedupe.originalLines));
  checksEl.appendChild(demoMakeCheck('真实去重后 ' + realDedupe.linesToKeep + '/' + realDedupe.originalLines + ' 行', realDedupe.linesToKeep < realDedupe.originalLines));
}

function demoMakeCheck(label, pass) {
  var row = document.createElement('div'); row.className = 'demo-check';
  var code = document.createElement('code'); code.textContent = label;
  var badge = document.createElement('span'); badge.className = 'demo-check-pass ' + (pass ? 'yes' : 'no'); badge.textContent = pass ? '通过' : '未通过';
  row.appendChild(code); row.appendChild(badge);
  return row;
}

function demoStopAtSuffixStart(text, suffix) {
  var trimmed = suffix.trimStart();
  if (!trimmed || !text) return { output: text, stopped: false };
  var checkLen = Math.min(20, trimmed.length);
  var buf = '', out = '';
  for (var i = 0; i < text.length; i++) {
    buf += text[i];
    while (buf.length >= checkLen) {
      if (trimmed.startsWith(buf.slice(0, checkLen))) return { output: out, stopped: true };
      out += buf[0]; buf = buf.slice(1);
    }
  }
  if (buf && !trimmed.startsWith(buf)) out += buf;
  return { output: out, stopped: out.length < text.length };
}

function demoGetLineBelowCursor(lines, startLine) {
  var line = '', i = 1;
  while (!line.trim() && startLine + i <= lines.length - 1) { line = lines[Math.min(startLine + i, lines.length - 1)]; i++; }
  return line;
}

function demoRunTransform(lines, startLine, suffix, text) {
  if (!text) return { output: '', rawText: '', lineBelowCursor: '', stoppedAtSuffix: false, stoppedAtLine: false };
  var lineBelow = demoGetLineBelowCursor(lines, startLine);
  var suffixStop = demoStopAtSuffixStart(text, suffix);
  var outLines = suffixStop.output.split('\\n'); outLines.pop();
  var stoppedAtLine = false;
  if (lineBelow && lineBelow.trim()) {
    for (var i = 0; i < outLines.length; i++) {
      if (outLines[i] === lineBelow) { outLines = outLines.slice(0, i); stoppedAtLine = true; break; }
    }
  }
  return { output: outLines.join('\\n'), rawText: text, lineBelowCursor: lineBelow, stoppedAtSuffix: suffixStop.stopped, stoppedAtLine: stoppedAtLine };
}

function demoRunDedupe(lines, startLine, completionText) {
  var compLines = completionText.split('\\n');
  var toKeep = compLines.length;
  if (!completionText) return { displayed: '', linesToKeep: 0, originalLines: 0 };
  for (var i = 1; i <= Math.min(compLines.length, lines.length - startLine - 1); i++) {
    var docLine = lines[startLine + i];
    if (docLine === undefined) break;
    if (docLine.trim() === compLines[compLines.length - i].trim()) { toKeep = compLines.length - i; } else break;
  }
  return { displayed: compLines.slice(0, toKeep).join('\\n'), linesToKeep: toKeep, originalLines: compLines.length };
}

function demoMoveCursor() {
  var code = document.getElementById('demoCode');
  var lineNum = Number(document.getElementById('demoLine').value) || 1;
  var charNum = Number(document.getElementById('demoChar').value) || 0;
  var lines = code.value.split('\\n');
  var offset = 0;
  for (var i = 0; i < Math.min(lineNum - 1, lines.length); i++) offset += lines[i].length + 1;
  offset += Math.min(charNum, (lines[lineNum - 1] || '').length);
  code.setSelectionRange(offset, offset);
  code.focus();
  demoRenderAll();
}

function demoResetExample() {
  document.getElementById('demoCode').value = defaultDemoSource;
  document.getElementById('demoSimCompletion').value = defaultDemoCompletion;
  demoState.realCompletion = '';
  demoMoveCursor();
}

function demoLoadConfig() {
  fetch('/audit/api/demo/config').then(function(r) { return r.json(); }).then(function(data) {
    if (data.error) throw new Error(data.error);
    demoState.config = data;
    var el = document.getElementById('demoServerStatus');
    if (el) { el.textContent = (data.provider||'') + ' / ' + data.model; el.className = 'demo-pill ' + (data.hasApiKey ? 'good' : 'warn'); }
    demoRenderAll();
  }).catch(function(e) {
    var el = document.getElementById('demoServerStatus');
    if (el) { el.textContent = e.message; el.className = 'demo-pill warn'; }
  });
}

function demoRunFim() {
  if (demoState.abortController) demoState.abortController.abort();
  var ctx = demoGetContext();
  demoState.realCompletion = '';
  demoState.abortController = new AbortController();
  document.getElementById('demoRun').disabled = true;
  document.getElementById('demoStop').disabled = false;
  var statusEl = document.getElementById('demoRequestStatus');
  statusEl.textContent = '请求中...';
  statusEl.className = 'demo-pill warn';
  demoRenderAll();

  fetch('/audit/api/demo/fim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prefix: ctx.prefix, suffix: ctx.suffix,
      maxTokens: Number(document.getElementById('demoMaxTokens').value) || 128,
      temperature: Number(document.getElementById('demoTemp').value) || 0.01,
    }),
    signal: demoState.abortController.signal,
  }).then(function(resp) {
    if (!resp.ok || !resp.body) throw new Error('请求失败: ' + resp.status);
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    function readChunk() {
      return reader.read().then(function(result) {
        if (result.done) return;
        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\\n');
        buffer = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          try {
            var event = JSON.parse(lines[i]);
            if (event.type === 'meta') { statusEl.textContent = '已连接: ' + event.model; }
            else if (event.type === 'chunk') { demoState.realCompletion += event.text; demoRenderAll(); }
            else if (event.type === 'error') throw new Error(event.message);
          } catch(ex) { if (ex.message && ex.message.indexOf('JSON') === -1) throw ex; }
        }
        return readChunk();
      });
    }
    return readChunk();
  }).then(function() {
    statusEl.textContent = '完成'; statusEl.className = 'demo-pill good';
  }).catch(function(err) {
    if (err.name === 'AbortError') { statusEl.textContent = '已停止'; statusEl.className = 'demo-pill warn'; }
    else { statusEl.textContent = err.message; statusEl.className = 'demo-pill warn'; }
  }).finally(function() {
    demoState.abortController = null;
    document.getElementById('demoRun').disabled = false;
    document.getElementById('demoStop').disabled = true;
    demoRenderAll();
  });
}

// Lazy init demo panel when tab is clicked
document.querySelectorAll('.tab-btn').forEach(function(tab) {
  tab.addEventListener('click', function() {
    if (tab.dataset.tab === 'demo') initDemoPanel();
  });
});

// 初始化
fetchRecords();
connectSSE();
</script>
</body>
</html>`;
