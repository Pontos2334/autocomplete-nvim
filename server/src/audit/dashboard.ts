export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Completion Audit</title>
<style>
:root {
  --bg-root: #ffffff;
  --bg-surface: #fafafa;
  --bg-elevated: #ffffff;
  --bg-inset: #f3f4f6;
  --border: #e5e7eb;
  --border-focus: #d1d5db;
  --text-primary: #111827;
  --text-secondary: #4b5563;
  --text-muted: #9ca3af;
  --accent: #2563eb;
  --accent-dim: rgba(37, 99, 235, 0.08);
  --green: #059669;
  --green-dim: rgba(5, 150, 105, 0.08);
  --orange: #d97706;
  --orange-dim: rgba(217, 119, 6, 0.08);
  --red: #dc2626;
  --red-dim: rgba(220, 38, 38, 0.06);
  --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "Geist Mono", "Fira Code", "SF Mono", Consolas, monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body { background: var(--bg-root); color: var(--text-primary); font-family: var(--font-body); font-size: 14px; line-height: 1.6; }

.dashboard {
  display: grid;
  grid-template-columns: 380px 1fr;
  grid-template-rows: 56px 1fr;
  height: 100vh;
  overflow: hidden;
}

.dash-header {
  grid-column: 1 / -1;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px;
  background: var(--bg-root);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  z-index: 10;
}
.dash-logo { display: flex; align-items: center; gap: 12px; }
.dash-logo-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 600; font-size: 15px; font-family: var(--font-mono);
  box-shadow: 0 2px 4px var(--accent-dim);
}
.dash-logo-text { font-family: var(--font-body); font-weight: 600; font-size: 14px; color: var(--text-primary); letter-spacing: 0.3px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); transition: background .3s; }
.status-dot.error { background: var(--red); }
.dash-stats { display: flex; gap: 12px; }
.stat-chip {
  font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 20px;
  padding: 4px 12px; font-weight: 500;
}
.btn-sm {
  font-family: var(--font-body); font-size: 13px; font-weight: 500; color: var(--text-secondary);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 6px 14px; cursor: pointer; transition: all .2s ease;
}
.btn-sm:hover { border-color: var(--border-focus); color: var(--text-primary); background: var(--bg-elevated); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }

.request-list {
  grid-column: 1;
  display: flex; flex-direction: column;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
}
.filter-bar { display: flex; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-root); }
.filter-tab {
  font-family: var(--font-body); font-size: 12px; font-weight: 500;
  color: var(--text-secondary); background: none; border: 1px solid transparent;
  border-radius: 6px; padding: 6px 12px; cursor: pointer; transition: all .2s;
}
.filter-tab:hover { color: var(--text-primary); background: var(--bg-inset); }
.filter-tab.active { color: var(--accent); background: var(--accent-dim); }
.request-rows { flex: 1; overflow-y: auto; padding: 8px; }
.request-rows::-webkit-scrollbar { width: 6px; }
.request-rows::-webkit-scrollbar-track { background: transparent; }
.request-rows::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

.request-row {
  padding: 12px 14px; margin-bottom: 4px; border: 1px solid transparent; border-radius: 8px;
  cursor: pointer; transition: all .2s ease; background: var(--bg-root);
  animation: rowSlideIn .25s ease-out;
}
.request-row:hover { border-color: var(--border); box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.request-row.selected { background: var(--accent-dim); border-color: rgba(37,99,235,0.2); }
.row-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.row-time { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
.row-file { font-family: var(--font-mono); font-size: 12px; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.row-status { display: flex; align-items: center; gap: 4px; }
.row-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.row-status-dot.green { background: var(--green); }
.row-status-dot.orange { background: var(--orange); }
.row-status-dot.red { background: var(--red); }
.row-status-dot.blue { background: var(--accent); animation: pulse 1.5s ease-in-out infinite; }
.row-bottom { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
.row-badge {
  display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;
}
.row-badge.cache { background: var(--green-dim); color: var(--green); }
.row-badge.multi { background: var(--accent-dim); color: var(--accent); }
.row-badge.filtered { background: var(--orange-dim); color: var(--orange); }

.request-detail { grid-column: 2; display: flex; flex-direction: column; overflow: hidden; min-height: 0; background: var(--bg-root); }
.detail-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
}
.empty-icon { font-family: var(--font-mono); font-size: 32px; color: var(--text-muted); opacity: .3; }
.empty-title { font-family: var(--font-body); font-size: 18px; font-weight: 600; color: var(--text-primary); }
.empty-sub { font-size: 14px; color: var(--text-secondary); text-align: center; max-width: 360px; line-height: 1.6; }

.detail-tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--bg-root); padding: 0 20px; gap: 16px; flex-shrink: 0; }
.tab-btn {
  font-family: var(--font-body); font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  background: none; border: none; border-bottom: 2px solid transparent;
  padding: 14px 4px; cursor: pointer; transition: all .2s;
}
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active { color: var(--text-primary); border-bottom-color: var(--accent); }
.tab-panels { flex: 1; overflow-y: auto; min-height: 0; background: var(--bg-root); }
.tab-panels::-webkit-scrollbar { width: 6px; }
.tab-panels::-webkit-scrollbar-track { background: transparent; }
.tab-panels::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.tab-panel { display: none; padding: 24px 32px; animation: fadeIn .2s ease-out; }
.tab-panel.active { display: block; }

.section { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.01); }
.section-title { font-family: var(--font-body); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); margin-bottom: 16px; }

.timeline { display: flex; align-items: flex-start; justify-content: space-between; position: relative; padding: 0 8px; flex-wrap: wrap; gap: 12px; }
.tl-step { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 64px; }
.tl-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border-focus); opacity: .4; }
.tl-dot.done { background: var(--green); opacity: 1; box-shadow: 0 0 0 3px var(--green-dim); }
.tl-dot.fail { background: var(--red); opacity: 1; box-shadow: 0 0 0 3px var(--red-dim); }
.tl-dot.active { background: var(--accent); opacity: 1; box-shadow: 0 0 0 3px var(--accent-dim); animation: pulse 1.5s ease-in-out infinite; }
.tl-label { font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
.tl-time { font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); }
.tl-delta { font-family: var(--font-mono); font-size: 10px; color: var(--accent); font-weight: 500; }

.params-grid { display: grid; grid-template-columns: 140px 1fr; gap: 8px 24px; }
.param-key { font-family: var(--font-body); font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.param-val { font-family: var(--font-mono); font-size: 13px; color: var(--text-primary); word-break: break-all; }
.param-val .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge-on { background: var(--green-dim); color: var(--green); }
.badge-off { background: var(--bg-inset); color: var(--text-secondary); }

.code-block {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
.code-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; background: var(--bg-root); border-bottom: 1px solid var(--border);
  font-family: var(--font-body); font-size: 12px; font-weight: 600;
  color: var(--text-primary);
}
.code-header .copy-btn {
  font-family: var(--font-body); font-size: 11px; font-weight: 500; color: var(--text-secondary);
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 10px; cursor: pointer; transition: all .2s ease;
}
.code-header .copy-btn:hover { color: var(--text-primary); border-color: var(--border-focus); background: var(--bg-root); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.code-body {
  padding: 16px; font-family: var(--font-mono); font-size: 13px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-all; color: var(--text-primary);
  max-height: 400px; overflow-y: auto; background: var(--bg-root);
}
.code-body::-webkit-scrollbar { width: 6px; }
.code-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

.error-block { background: var(--red-dim); border-left: 3px solid var(--red); border-radius: 0 8px 8px 0; padding: 16px; margin-bottom: 20px; }
.error-type { font-family: var(--font-mono); font-size: 15px; font-weight: 600; color: var(--red); }
.error-msg { font-family: var(--font-body); font-size: 14px; color: var(--text-primary); margin-top: 6px; }

.filter-block { background: var(--orange-dim); border-left: 3px solid var(--orange); border-radius: 0 8px 8px 0; padding: 16px; margin-bottom: 20px; }
.filter-type { font-family: var(--font-mono); font-size: 15px; font-weight: 600; color: var(--orange); }

.json-body {
  padding: 16px; background: var(--bg-root); border: 1px solid var(--border); border-radius: 8px;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-all;
  max-height: 600px; overflow-y: auto;
}
.json-body::-webkit-scrollbar { width: 6px; }
.json-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.jk { color: var(--text-secondary); }
.js { color: var(--green); }
.jn { color: var(--orange); }
.jb { color: var(--accent); }

.toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 1000; display: flex; flex-direction: column; gap: 12px; }
.toast {
  background: var(--text-primary); border: none; border-radius: 8px;
  padding: 12px 20px; font-family: var(--font-body); font-size: 14px; color: #fff; font-weight: 500;
  animation: toastIn .3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
}
.toast.out { animation: toastOut .3s ease-in forwards; }
.conn-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 999;
  background: var(--red); border-bottom: 1px solid rgba(0,0,0,0.1);
  padding: 8px 16px; text-align: center;
  font-family: var(--font-body); font-size: 13px; font-weight: 500; color: #fff;
  display: none; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
}

@keyframes rowSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%,100% { opacity: 1; box-shadow: 0 0 0 3px var(--accent-dim); } 50% { opacity: .6; box-shadow: 0 0 0 1px var(--accent-dim); } }
@keyframes toastIn { from { opacity: 0; transform: translateY(24px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes toastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(24px) scale(0.95); } }

@media (max-width: 900px) {
  .dashboard { grid-template-columns: 1fr; grid-template-rows: 56px 40vh 60vh; }
  .request-list { grid-column: 1; border-right: none; border-bottom: 1px solid var(--border); }
  .request-detail { grid-column: 1; }
}

/* Demo / FIM Tester */
.demo-split { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.demo-input, .demo-output { display: flex; flex-direction: column; gap: 16px; }
.demo-card { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
.demo-card-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-root); border-bottom: 1px solid var(--border); }
.demo-card-title { font-family: var(--font-body); font-size: 13px; font-weight: 600; color: var(--text-primary); }
.demo-card-note { font-size: 12px; color: var(--text-muted); }
.demo-textarea {
  width: 100%; border: none; outline: none; resize: vertical; padding: 16px;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.6; background: var(--bg-surface); color: var(--text-primary);
}
.demo-textarea.code-editor { min-height: 360px; background: #0f172a; color: #e5e7eb; }
.demo-textarea.comp-input { min-height: 100px; }
.demo-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 16px; background: var(--bg-root); border-bottom: 1px solid var(--border); }
.demo-metric { text-align: center; }
.demo-metric-label { font-size: 11px; font-weight: 500; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.demo-metric-value { font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--text-primary); margin-top: 4px; }
.demo-pre { margin: 0; padding: 16px; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; max-height: 240px; overflow-y: auto; background: var(--bg-surface); color: var(--text-primary); }
.demo-pre::-webkit-scrollbar { width: 6px; }
.demo-pre::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.demo-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-root); }
.demo-field { display: flex; align-items: center; gap: 8px; }
.demo-field label { font-family: var(--font-body); font-size: 12px; font-weight: 500; color: var(--text-secondary); white-space: nowrap; }
.demo-field input { width: 80px; height: 32px; border: 1px solid var(--border); border-radius: 6px; padding: 0 8px; font-family: var(--font-mono); font-size: 12px; background: var(--bg-root); color: var(--text-primary); transition: border-color .2s; outline: none; }
.demo-field input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
.demo-btn { height: 32px; border: 1px solid var(--border); border-radius: 6px; padding: 0 14px; font-family: var(--font-body); font-size: 12px; font-weight: 600; cursor: pointer; background: var(--bg-surface); color: var(--text-secondary); transition: all .2s; }
.demo-btn:hover { border-color: var(--border-focus); color: var(--text-primary); background: var(--bg-root); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.demo-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.demo-btn.primary:hover { background: #1d4ed8; border-color: #1d4ed8; color: #fff; box-shadow: 0 2px 4px var(--accent-dim); }
.demo-btn.danger { color: var(--red); border-color: rgba(220,38,38,.3); }
.demo-btn.danger:hover { background: var(--red-dim); border-color: rgba(220,38,38,.5); }
.demo-btn:disabled { opacity: .5; cursor: not-allowed; }
.demo-status-bar { display: flex; gap: 12px; padding: 12px 16px; flex-wrap: wrap; background: var(--bg-root); border-bottom: 1px solid var(--border); }
.demo-pill { font-family: var(--font-mono); font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 16px; border: 1px solid var(--border); color: var(--text-secondary); background: var(--bg-surface); }
.demo-pill.good { border-color: rgba(5,150,105,.2); color: var(--green); background: var(--green-dim); }
.demo-pill.warn { border-color: rgba(217,119,6,.2); color: var(--orange); background: var(--orange-dim); }
.demo-checks { display: flex; flex-direction: column; gap: 8px; padding: 16px; }
.demo-check { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--font-body); font-size: 12px; background: var(--bg-root); }
.demo-check code { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
.demo-check-pass { padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.demo-check-pass.yes { background: var(--green-dim); color: var(--green); }
.demo-check-pass.no { background: var(--red-dim); color: var(--red); }
.demo-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; border-bottom: 1px solid var(--border); }
.demo-block { }
.demo-block-label { font-family: var(--font-body); font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
</style>
</head>
<body>

<div id="connBanner" class="conn-banner"></div>

<div class="dashboard">
  <header class="dash-header">
    <div class="dash-logo">
      <div class="dash-logo-icon">A</div>
      <span class="dash-logo-text" id="logoText"></span>
      <div class="status-dot" id="statusDot"></div>
    </div>
    <div class="dash-stats">
      <span class="stat-chip" id="callCount"></span>
      <span class="stat-chip" id="cacheRate"></span>
    </div>
    <button class="btn-sm" id="clearBtn"></button>
  </header>

  <aside class="request-list">
    <div class="filter-bar">
      <button class="filter-tab active" data-filter="all" id="filterAll"></button>
      <button class="filter-tab" data-filter="completed" id="filterCompleted"></button>
      <button class="filter-tab" data-filter="filtered" id="filterFiltered"></button>
      <button class="filter-tab" data-filter="error" id="filterError"></button>
    </div>
    <div class="request-rows" id="requestRows"></div>
  </aside>

  <main class="request-detail">
    <div class="detail-empty" id="detailEmpty">
      <div class="empty-icon">[A]</div>
      <div class="empty-title" id="emptyTitle"></div>
      <div class="empty-sub" id="emptySub"></div>
    </div>
    <div id="detailContent" style="display:none">
      <nav class="detail-tabs" id="detailTabs">
        <button class="tab-btn active" data-tab="overview" id="tabOverview"></button>
        <button class="tab-btn" data-tab="prompt">Prompt</button>
        <button class="tab-btn" data-tab="prefix" id="tabPrefix"></button>
        <button class="tab-btn" data-tab="suffix" id="tabSuffix"></button>
        <button class="tab-btn" data-tab="completion" id="tabCompletion"></button>
        <button class="tab-btn" data-tab="raw" id="tabRaw"></button>
        <button class="tab-btn" data-tab="demo" id="tabDemo"></button>
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
var _lang = (navigator.language || 'en').startsWith('zh') ? 'zh' : 'en';
var i18n = {
  title:        { en: 'Completion Audit', zh: '\\u8865\\u5168\\u5ba1\\u8ba1\\u9762\\u677f' },
  connLost:     { en: 'Connection lost, reconnecting...', zh: '\\u8fde\\u63a5\\u65ad\\u5f00\\uff0c\\u6b63\\u5728\\u91cd\\u8fde...' },
  calls:        { en: ' calls', zh: ' \\u6b21\\u8c03\\u7528' },
  cacheLabel:   { en: 'Cache: ', zh: '\\u7f13\\u5b58: ' },
  clear:        { en: 'Clear', zh: '\\u6e05\\u7a7a' },
  all:          { en: 'All', zh: '\\u5168\\u90e8' },
  completed:    { en: 'Completed', zh: '\\u5b8c\\u6210' },
  filtered:     { en: 'Filtered', zh: '\\u5df2\\u8fc7\\u6ee4' },
  error:        { en: 'Error', zh: '\\u9519\\u8bef' },
  selectReq:    { en: 'Select a request', zh: '\\u9009\\u62e9\\u4e00\\u4e2a\\u8bf7\\u6c42' },
  emptySub:     { en: 'Click a request from the list to view prompt, completion, and timing details.', zh: '\\u4ece\\u5de6\\u4fa7\\u5217\\u8868\\u70b9\\u51fb\\u4e00\\u4e2a\\u8bf7\\u6c42\\uff0c\\u67e5\\u770b Prompt\\u3001\\u8865\\u5168\\u7ed3\\u679c\\u548c\\u8017\\u65f6\\u8be6\\u60c5\\u3002' },
  overview:     { en: 'Overview', zh: '\\u6982\\u89c8' },
  prefix:       { en: 'Prefix', zh: '\\u524d\\u7f00' },
  suffix:       { en: 'Suffix', zh: '\\u540e\\u7f00' },
  completion:   { en: 'Completion', zh: '\\u8865\\u5168\\u7ed3\\u679c' },
  raw:          { en: 'Raw', zh: '\\u539f\\u59cb\\u6570\\u636e' },
  fimTest:      { en: 'FIM Test', zh: 'FIM \\u6d4b\\u8bd5' },
  copied:       { en: 'Copied', zh: '\\u5df2\\u590d\\u5236' },
  copy:         { en: 'Copy', zh: '\\u590d\\u5236' },
  cleared:      { en: 'Cleared', zh: '\\u5df2\\u6e05\\u7a7a' },
  lines:        { en: ' lines', zh: '\\u884c' },
  cache:        { en: 'Cache', zh: '\\u7f13\\u5b58' },
  reuse:        { en: 'Reuse', zh: '\\u590d\\u7528' },
  multi:        { en: 'Multi', zh: '\\u591a\\u884c' },
  yes:          { en: 'Yes', zh: '\\u662f' },
  no:           { en: 'No', zh: '\\u5426' },
  hit:          { en: 'Hit', zh: '\\u547d\\u4e2d' },
  miss:         { en: 'Miss', zh: '\\u672a\\u547d\\u4e2d' },
  filterReason: { en: 'Filter reason: ', zh: '\\u8fc7\\u6ee4\\u539f\\u56e0: ' },
  chars:        { en: ' chars', zh: ' \\u5b57\\u7b26' },
  timeline:     { en: 'Timeline', zh: '\\u65f6\\u95f4\\u7ebf' },
  params:       { en: 'Parameters', zh: '\\u53c2\\u6570' },
  contextSnip:  { en: 'Context Snippets', zh: '\\u4e0a\\u4e0b\\u6587\\u7247\\u6bb5' },
  req:          { en: 'Request', zh: '\\u8bf7\\u6c42' },
  llmStart:     { en: 'LLM Start', zh: 'LLM \\u5f00\\u59cb' },
  firstChunk:   { en: 'First Chunk', zh: '\\u9996\\u5305' },
  llmEnd:       { en: 'LLM End', zh: 'LLM \\u7ed3\\u675f' },
  complete:     { en: 'Complete', zh: '\\u5b8c\\u6210' },
  file:         { en: 'File', zh: '\\u6587\\u4ef6' },
  language:     { en: 'Language', zh: '\\u8bed\\u8a00' },
  model:        { en: 'Model', zh: '\\u6a21\\u578b' },
  apiBase:      { en: 'API Base', zh: 'API \\u5730\\u5740' },
  duration:     { en: 'Duration', zh: '\\u8017\\u65f6' },
  lineCount:    { en: 'Lines', zh: '\\u884c\\u6570' },
  chunkCount:   { en: 'Chunks', zh: '\\u5206\\u5757\\u6570' },
  reuseReason:  { en: 'Reuse Reason', zh: '\\u590d\\u7528\\u539f\\u56e0' },
  manual:       { en: 'Manual', zh: '\\u624b\\u52a8\\u89e6\\u53d1' },
  softTimeout:  { en: 'Soft Timeout', zh: '\\u8f6f\\u8d85\\u65f6\\u8fd4\\u56de' },
  timeout:      { en: 'Timeout', zh: '\\u8d85\\u65f6' },
  rootPath:     { en: 'Root Path', zh: '\\u6839\\u8def\\u5f84' },
  imports:      { en: 'Imports', zh: '\\u5bfc\\u5165' },
  editRange:    { en: 'Edit Range', zh: '\\u7f16\\u8f91\\u8303\\u56f4' },
  opened:       { en: 'Opened', zh: '\\u5df2\\u6253\\u5f00' },
  fullPrompt:   { en: 'Full Prompt', zh: '\\u5b8c\\u6574 Prompt' },
  prefixSlash:  { en: 'Prefix', zh: 'Prefix / \\u524d\\u7f00' },
  suffixSlash:  { en: 'Suffix', zh: 'Suffix / \\u540e\\u7f00' },
  llmOutput:    { en: 'LLM Raw Output', zh: 'LLM \\u539f\\u59cb\\u8f93\\u51fa' },
  postproc:     { en: 'Post-processed', zh: '\\u540e\\u5904\\u7406\\u7ed3\\u679c' },
  finalDisp:    { en: 'Final Display', zh: '\\u6700\\u7ec8\\u663e\\u793a' },
  compOpts:     { en: 'Completion Options', zh: '\\u8865\\u5168\\u53c2\\u6570' },
  readConfig:   { en: 'Reading model config...', zh: '\\u6b63\\u5728\\u8bfb\\u53d6\\u6a21\\u578b\\u914d\\u7f6e...' },
  idle:         { en: 'Idle', zh: '\\u7a7a\\u95f2' },
  editSrc:      { en: 'Editable Source', zh: '\\u53ef\\u7f16\\u8f91\\u6e90\\u7801' },
  cursorNote:   { en: 'textarea cursor = test cursor', zh: 'textarea \\u5149\\u6807 = \\u6d4b\\u8bd5\\u5149\\u6807' },
  lineNum:      { en: 'Line', zh: '\\u884c\\u53f7' },
  column:       { en: 'Col', zh: '\\u5217' },
  resetEx:      { en: 'Reset', zh: '\\u6062\\u590d\\u793a\\u4f8b' },
  simComp:      { en: 'Simulated Completion', zh: '\\u6a21\\u62df\\u8865\\u5168\\u6587\\u672c' },
  editable:     { en: 'Editable', zh: '\\u53ef\\u624b\\u52a8\\u7f16\\u8f91' },
  liveCtx:      { en: 'Live Context', zh: '\\u5b9e\\u65f6\\u4e0a\\u4e0b\\u6587' },
  cursorOff:    { en: 'Cursor Offset', zh: '\\u5149\\u6807\\u504f\\u79fb' },
  cursorPos:    { en: 'Cursor Position', zh: '\\u5149\\u6807\\u4f4d\\u7f6e' },
  prefixCh:     { en: 'Prefix Chars', zh: 'Prefix \\u5b57\\u7b26' },
  suffixCh:     { en: 'Suffix Chars', zh: 'Suffix \\u5b57\\u7b26' },
  liveFim:      { en: 'Live FIM Request', zh: '\\u771f\\u5b9e FIM \\u8bf7\\u6c42' },
  proxyNote:    { en: 'Proxied via audit server, API key not exposed', zh: '\\u901a\\u8fc7 audit server \\u4ee3\\u7406\\uff0c\\u4e0d\\u66b4\\u9732 API Key' },
  runFim:       { en: 'Run FIM', zh: '\\u8fd0\\u884c FIM' },
  stop:         { en: 'Stop', zh: '\\u505c\\u6b62' },
  modelOut:     { en: 'Model Output', zh: '\\u6a21\\u578b\\u8f93\\u51fa' },
  noOutput:     { en: '(no output yet)', zh: '(\\u5c1a\\u65e0\\u8f93\\u51fa)' },
  requesting:   { en: 'Requesting...', zh: '\\u8bf7\\u6c42\\u4e2d...' },
  connected:    { en: 'Connected: ', zh: '\\u5df2\\u8fde\\u63a5: ' },
  reqFailed:    { en: 'Request failed: ', zh: '\\u8bf7\\u6c42\\u5931\\u8d25: ' },
  done:         { en: 'Done', zh: '\\u5b8c\\u6210' },
  stopped:      { en: 'Stopped', zh: '\\u5df2\\u505c\\u6b62' },
  pass:         { en: 'Pass', zh: '\\u901a\\u8fc7' },
  fail:         { en: 'Fail', zh: '\\u672a\\u901a\\u8fc7' },
};
function t(k) { return (i18n[k] && i18n[k][_lang]) || k; }

function applyI18nToHtml() {
  document.documentElement.lang = _lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('title');
  document.getElementById('connBanner').textContent = t('connLost');
  document.getElementById('logoText').textContent = t('title');
  document.getElementById('clearBtn').textContent = t('clear');
  document.getElementById('filterAll').textContent = t('all');
  document.getElementById('filterCompleted').textContent = t('completed');
  document.getElementById('filterFiltered').textContent = t('filtered');
  document.getElementById('filterError').textContent = t('error');
  document.getElementById('emptyTitle').textContent = t('selectReq');
  document.getElementById('emptySub').textContent = t('emptySub');
  document.getElementById('tabOverview').textContent = t('overview');
  document.getElementById('tabPrefix').textContent = t('prefix');
  document.getElementById('tabSuffix').textContent = t('suffix');
  document.getElementById('tabCompletion').textContent = t('completion');
  document.getElementById('tabRaw').textContent = t('raw');
  document.getElementById('tabDemo').textContent = t('fimTest');
}

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
  var te = document.createElement('div');
  te.className = 'toast'; te.textContent = msg;
  c.appendChild(te);
  setTimeout(function() { te.classList.add('out'); setTimeout(function() { te.remove(); }, 300); }, 2000);
}
function copyText(text) { navigator.clipboard.writeText(text).then(function() { toast(t('copied')); }).catch(function() {}); }
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
  }).catch(function(e) { console.error('Failed to fetch records:', e); });
}

function fetchDetail(id) {
  fetch('/audit/api/records/' + id).then(function(res) {
    if (res.ok) return res.json();
  }).then(function(data) {
    if (data) { state.selectedDetail = data; renderDetail(); }
  }).catch(function(e) { console.error('Failed to fetch detail:', e); });
}

function updateStats() {
  document.getElementById('callCount').textContent = state.totalCalls + t('calls');
  var rate = state.totalCalls > 0 ? Math.round(state.cacheHits / state.totalCalls * 100) : 0;
  document.getElementById('cacheRate').textContent = t('cacheLabel') + rate + '%';
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
        '<span>' + (r.numLines || 0) + t('lines') + '</span>' +
        (r.cacheHit ? '<span class="row-badge cache">' + t('cache') + '</span>' : '') +
        (r.reuseHit ? '<span class="row-badge cache">' + t('reuse') + '</span>' : '') +
        (r.isMultiline ? '<span class="row-badge multi">' + t('multi') + '</span>' : '') +
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
  var tm = r.timing || {};
  var steps = [
    { label: t('req'), at: tm.requestStartAt },
    { label: 'Prompt', at: tm.promptRenderedAt },
    { label: t('llmStart'), at: tm.llmCallStartAt },
    { label: t('firstChunk'), at: tm.firstChunkAt },
    { label: t('llmEnd'), at: tm.llmCallEndAt },
    { label: t('complete'), at: tm.completedAt || r.completedAt },
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
    kv(t('file'), esc(r.filename) + ':' + r.line + ':' + r.character) +
    kv(t('language'), esc(r.language)) +
    kv(t('model'), esc(r.modelProvider) + '/' + esc(r.modelName)) +
    kv(t('apiBase'), esc(r.apiBase)) +
    kv(t('duration'), fmtMs(r.durationMs)) +
    kv(t('lineCount'), r.numLines) +
    kv(t('chunkCount'), r.chunkCount) +
    kv(t('cache'), badge(r.cacheHit, t('hit'), t('miss'))) +
    kv(t('reuse'), badge(r.reuseHit, t('hit'), t('miss'))) +
    kv(t('reuseReason'), esc(r.reuseReason || '-')) +
    kv(t('multi'), badge(r.isMultiline)) +
    kv(t('manual'), badge(r.manuallyTriggered)) +
    kv(t('softTimeout'), badge(r.partialReturned || r.previewOnly)) +
    kv(t('timeout'), badge(r.timedOut)) +
  '</div>';

  var snip = r.snippetSummary;
  var snipHtml = '';
  if (snip) {
    snipHtml = '<div class="params-grid">' +
      kv(t('rootPath'), snip.rootPath) +
      kv(t('imports'), snip.imports) +
      kv('IDE/LSP', snip.ide) +
      kv(t('editRange'), snip.edited) +
      kv(t('opened'), snip.opened) +
    '</div>';
  }

  var content = '';
  if (r.error) {
    content += '<div class="error-block"><div class="error-type">' + esc(r.error.type) + '</div><div class="error-msg">' + esc(r.error.message) + '</div></div>';
  }
  if (r.filterReason) {
    content += '<div class="filter-block"><div class="filter-type">' + t('filterReason') + esc(r.filterReason) + '</div></div>';
  }
  content += section(t('timeline'), tlHtml);
  content += section(t('params'), paramsHtml);
  if (snipHtml) content += section(t('contextSnip'), snipHtml);

  document.getElementById('panel-overview').innerHTML = content;
}

function renderPrompt(r) {
  var html = '';
  html += codeBlock(t('fullPrompt') + ' (' + (r.prompt || '').length + t('chars') + ')', r.prompt, 'prompt-full');
  document.getElementById('panel-prompt').innerHTML = html;
  bindCopyButtons();
}

function renderPrefix(r) {
  var html = '';
  html += codeBlock(t('prefixSlash') + ' (' + (r.prefix || '').length + t('chars') + ')', r.prefix, 'prompt-prefix');
  document.getElementById('panel-prefix').innerHTML = html;
  bindCopyButtons();
}

function renderSuffix(r) {
  var html = '';
  html += codeBlock(t('suffixSlash') + ' (' + (r.suffix || '').length + t('chars') + ')', r.suffix, 'prompt-suffix');
  document.getElementById('panel-suffix').innerHTML = html;
  bindCopyButtons();
}

function renderCompletion(r) {
  var html = '';
  if (r.error) {
    html += '<div class="error-block"><div class="error-type">' + esc(r.error.type) + '</div><div class="error-msg">' + esc(r.error.message) + '</div></div>';
  }
  if (r.filterReason) {
    html += '<div class="filter-block"><div class="filter-type">' + t('filterReason') + esc(r.filterReason) + '</div></div>';
  }
  html += codeBlock(t('llmOutput') + ' (' + (r.completion || '').length + t('chars') + ')', r.completion, 'comp-raw');
  if (r.processedCompletion !== undefined) {
    html += codeBlock(t('postproc') + ' (' + (r.processedCompletion || '').length + t('chars') + ')', r.processedCompletion, 'comp-processed');
  }
  if (r.displayedCompletion !== undefined) {
    html += codeBlock(t('finalDisp') + ' (' + (r.displayedCompletion || '').length + t('chars') + ')', r.displayedCompletion, 'comp-displayed');
  }
  if (r.completionOptions) {
    html += codeBlock(t('compOpts'), JSON.stringify(r.completionOptions, null, 2), 'comp-options');
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
  if (on) return '<span class="badge badge-on">' + (trueText || t('yes')) + '</span>';
  return '<span class="badge badge-off">' + (falseText || t('no')) + '</span>';
}

function codeBlock(title, content, id) {
  return '<div class="code-block">' +
    '<div class="code-header">' +
      '<span>' + esc(title) + '</span>' +
      '<button class="copy-btn" data-copy-target="' + id + '">' + t('copy') + '</button>' +
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

// Filter tabs
document.querySelectorAll('.filter-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.filter-tab').forEach(function(tt) { tt.classList.remove('active'); });
    tab.classList.add('active');
    state.activeFilter = tab.dataset.filter;
    renderList();
  });
});

// Detail tabs
document.querySelectorAll('.tab-btn').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(tt) { tt.classList.remove('active'); });
    tab.classList.add('active');
    state.activeTab = tab.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('panel-' + state.activeTab).classList.add('active');
  });
});

// Clear
document.getElementById('clearBtn').addEventListener('click', function() {
  fetch('/audit/api/records', { method: 'DELETE' }).then(function() {
    state.records = []; state.totalCalls = 0; state.cacheHits = 0;
    state.selectedId = null; state.selectedDetail = null;
    renderList(); updateStats();
    document.getElementById('detailEmpty').style.display = '';
    document.getElementById('detailContent').style.display = 'none';
    toast(t('cleared'));
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
      '<span class="demo-pill" id="demoServerStatus">' + t('readConfig') + '</span>' +
      '<span class="demo-pill" id="demoRequestStatus">' + t('idle') + '</span>' +
    '</div>' +
    '<div style="padding:0 12px 12px">' +
    '<div class="demo-split">' +
      '<div class="demo-input">' +
        '<div class="demo-card">' +
          '<div class="demo-card-head"><span class="demo-card-title">' + t('editSrc') + '</span><span class="demo-card-note">' + t('cursorNote') + '</span></div>' +
          '<div class="demo-toolbar">' +
            '<div class="demo-field"><label>' + t('lineNum') + '</label><input id="demoLine" type="number" min="1" step="1"></div>' +
            '<div class="demo-field"><label>' + t('column') + '</label><input id="demoChar" type="number" min="0" step="1"></div>' +
            '<button class="demo-btn" id="demoReset">' + t('resetEx') + '</button>' +
          '</div>' +
          '<textarea class="demo-textarea code-editor" id="demoCode" spellcheck="false"></textarea>' +
        '</div>' +
        '<div class="demo-card">' +
          '<div class="demo-card-head"><span class="demo-card-title">' + t('simComp') + '</span><span class="demo-card-note">' + t('editable') + '</span></div>' +
          '<textarea class="demo-textarea comp-input" id="demoSimCompletion" spellcheck="false"></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="demo-output">' +
        '<div class="demo-card">' +
          '<div class="demo-card-head"><span class="demo-card-title">' + t('liveCtx') + '</span></div>' +
          '<div class="demo-metrics">' +
            '<div class="demo-metric"><div class="demo-metric-label">' + t('cursorOff') + '</div><div class="demo-metric-value" id="demoOffset">0</div></div>' +
            '<div class="demo-metric"><div class="demo-metric-label">' + t('cursorPos') + '</div><div class="demo-metric-value" id="demoCursor">1:0</div></div>' +
            '<div class="demo-metric"><div class="demo-metric-label">' + t('prefixCh') + '</div><div class="demo-metric-value" id="demoPrefixLen">0</div></div>' +
            '<div class="demo-metric"><div class="demo-metric-label">' + t('suffixCh') + '</div><div class="demo-metric-value" id="demoSuffixLen">0</div></div>' +
          '</div>' +
          '<div class="demo-grid2">' +
            '<div class="demo-block"><div class="demo-block-label">Prefix</div><pre class="demo-pre" id="demoPrefixOut"></pre></div>' +
            '<div class="demo-block"><div class="demo-block-label">Suffix</div><pre class="demo-pre" id="demoSuffixOut"></pre></div>' +
          '</div>' +
          '<div class="demo-checks" id="demoChecks"></div>' +
        '</div>' +
        '<div class="demo-card">' +
          '<div class="demo-card-head"><span class="demo-card-title">' + t('liveFim') + '</span><span class="demo-card-note">' + t('proxyNote') + '</span></div>' +
          '<div class="demo-toolbar">' +
            '<div class="demo-field"><label>max_tokens</label><input id="demoMaxTokens" type="number" value="128" min="1" max="4096"></div>' +
            '<div class="demo-field"><label>temperature</label><input id="demoTemp" type="number" value="0.01" min="0" max="2" step="0.01"></div>' +
            '<button class="demo-btn primary" id="demoRun">' + t('runFim') + '</button>' +
            '<button class="demo-btn danger" id="demoStop" disabled>' + t('stop') + '</button>' +
          '</div>' +
          '<div style="padding:10px 12px">' +
            '<div class="demo-block-label">' + t('modelOut') + '</div>' +
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
  document.getElementById('demoRealOutput').textContent = demoState.realCompletion || t('noOutput');
  var checksEl = document.getElementById('demoChecks');
  checksEl.innerHTML = '';
  checksEl.appendChild(demoMakeCheck('suffix contains app.listen', ctx.suffix.includes('app.listen')));
  checksEl.appendChild(demoMakeCheck('suffix contains module.exports', ctx.suffix.includes('module.exports')));
  checksEl.appendChild(demoMakeCheck('simulated output truncated to empty by transform', simTransform.output.trim().length === 0));
  checksEl.appendChild(demoMakeCheck('simulated dedup ' + simDedupe.linesToKeep + '/' + simDedupe.originalLines + ' lines', simDedupe.linesToKeep < simDedupe.originalLines));
  checksEl.appendChild(demoMakeCheck('real dedup ' + realDedupe.linesToKeep + '/' + realDedupe.originalLines + ' lines', realDedupe.linesToKeep < realDedupe.originalLines));
}

function demoMakeCheck(label, pass) {
  var row = document.createElement('div'); row.className = 'demo-check';
  var code = document.createElement('code'); code.textContent = label;
  var b = document.createElement('span'); b.className = 'demo-check-pass ' + (pass ? 'yes' : 'no'); b.textContent = pass ? t('pass') : t('fail');
  row.appendChild(code); row.appendChild(b);
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
  statusEl.textContent = t('requesting');
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
    if (!resp.ok || !resp.body) throw new Error(t('reqFailed') + resp.status);
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
            if (event.type === 'meta') { statusEl.textContent = t('connected') + event.model; }
            else if (event.type === 'chunk') { demoState.realCompletion += event.text; demoRenderAll(); }
            else if (event.type === 'error') throw new Error(event.message);
          } catch(ex) { if (ex.message && ex.message.indexOf('JSON') === -1) throw ex; }
        }
        return readChunk();
      });
    }
    return readChunk();
  }).then(function() {
    statusEl.textContent = t('done'); statusEl.className = 'demo-pill good';
  }).catch(function(err) {
    if (err.name === 'AbortError') { statusEl.textContent = t('stopped'); statusEl.className = 'demo-pill warn'; }
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

// Init
applyI18nToHtml();
fetchRecords();
connectSSE();
</script>
</body>
</html>`;
