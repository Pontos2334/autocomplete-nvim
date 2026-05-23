# autocomplete.nvim

基于 DeepSeek FIM API 的 Neovim AI 行内代码补全插件。

灵感来自 [Continue](https://github.com/continuedev/continue)（Apache 2.0），复用了其 FIM prefix/suffix 构造、suffix-aware 渲染、流式 SSE 处理、轻量缓存和审计面板等核心思路。

采用客户端-服务端架构：Lua 客户端负责 Neovim 端的 ghost text 渲染与上下文收集，Node.js 服务端负责与 DeepSeek API 通信、流式过滤和审计日志。

[English Documentation](README.en.md)

## 功能特性

- 通过 Neovim extmarks 实现行内 ghost text 补全
- `Tab` 接受补全，无 ghost text 时回退到正常 Tab 行为，兼容 nvim-cmp
- `Ctrl-e` 取消 ghost text 且不移动光标
- 插入模式下自动防抖触发补全
- 手动触发补全的命令和快捷键
- 通过 `~/.config/nvim/autocomplete-nvim.json` 配置 DeepSeek FIM
- LSP/import 定义片段、最近编辑/访问、打开的 buffer 和工作区配置片段
- 审计面板，支持 SQLite（优先）和内存回退
- 请求复用、链式补全、Enter/Backspace 触发延迟、可选状态栏组件
- 无需重启 Neovim 即可停止/重启插件

## 环境要求

- Neovim 0.11+
- Node.js 20+
- DeepSeek FIM 配置文件 `~/.config/nvim/autocomplete-nvim.json`

配置示例：

```json
{
  "model": {
    "title": "DeepSeek FIM",
    "provider": "deepseek",
    "model": "deepseek-v4-pro",
    "apiBase": "https://api.deepseek.com/beta",
    "apiKey": "YOUR_KEY"
  },
  "options": {
    "debounceDelay": 300,
    "maxPromptTokens": 4096,
    "useCache": true
  },
  "audit": {
    "enabled": true,
    "port": 3210
  }
}
```

## 构建

```sh
cd server
npm install
npm run build
```

## 测试

```sh
cd server
npm test
```

项目根目录运行 Lua 测试：

```sh
for t in tests/lua/test_*.lua; do
  nvim --headless -u NONE --cmd "set rtp+=." -l "$t"
done
```

## 安装

使用 [lazy.nvim](https://lazy.folke.io)：

```lua
{
  "Pontos2334/autocomplete-nvim",
  build = "cd server && npm install && npm run build",
  config = function()
    require("autocomplete_nvim").setup({
      enabled = true,
      keymaps = {
        accept = "<Tab>",
        dismiss = "<C-e>",
        trigger = "<C-M-Space>",
        open_audit = "<leader>aa",
      },
    })
  end,
}
```

> **注意：** 系统需要安装 Node.js 20+。`build` 步骤会在安装时自动编译内置的 TypeScript 服务端。

### 配置项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `true` | 启用/禁用插件 |
| `debounce_delay` | `350` | 普通输入后触发补全的防抖延迟（毫秒） |
| `enter_trigger_delay` | `120` | 回车/换行后的触发延迟（0 时回退到 `debounce_delay`） |
| `backspace_trigger_delay` | `180` | 退格/删除后的触发延迟（0 时回退到 `debounce_delay`） |
| `chain_completion_delay` | `0` | 接受补全后触发下一次的延迟（0 = 禁用） |
| `node_command` | `"node"` | Node.js 可执行文件路径 |
| `config_path` | `~/.config/nvim/autocomplete-nvim.json` | 配置文件路径 |
| `keymaps.accept` | `"<Tab>"` | 接受 ghost text 的快捷键 |
| `keymaps.dismiss` | `"<C-e>"` | 取消 ghost text 的快捷键 |
| `keymaps.trigger` | `"<C-M-Space>"` | 手动触发补全的快捷键 |
| `keymaps.open_audit` | `nil` | 打开审计面板的快捷键 |
| `ghost_text.hl_group` | `"Comment"` | ghost text 的高亮组 |
| `filetypes` | `nil` | 文件类型白名单（nil = 全部） |
| `disable_in_files` | `{}` | 禁用补全的 glob 模式列表（如 `{"*.md", "node_modules/**"}`） |
| `context.enabled` | `true` | 启用轻量级相关代码上下文 |
| `context.include_imports` | `true` | 通过 LSP 解析 import/require/use 定义 |
| `context.include_open_buffers` | `true` | 包含最近打开的 buffer 片段 |
| `context.include_workspace_config` | `true` | 包含项目配置文件如 `package.json`、`go.mod` |
| `context.timeout_ms` | `100` | 上下文收集超时（毫秒） |
| `context.max_snippets` | `8` | 每个上下文类别的最大片段数 |
| `context.max_snippet_chars` | `4000` | 单个片段最大字符数 |
| `context.max_total_chars` | `12000` | 服务端裁剪前的上下文总字符上限 |
| `notify` | `true` | 显示通知消息 |

服务端 `options.showWhateverWeHaveAtMs` 默认为 `0`。在 `~/.config/nvim/autocomplete-nvim.json` 中设置可在软超时后返回部分流式内容。

### 命令

- `:AutocompleteNvimTrigger` — 手动触发补全
- `:AutocompleteNvimReload` — 从磁盘重新加载配置
- `:AutocompleteNvimAudit` — 在浏览器中打开审计面板
- `:AutocompleteNvimStop` — 停止插件（再次调用 `setup()` 重启）

### 停止 / 重启

```lua
-- 停止插件
require("autocomplete_nvim").stop()

-- 重启
require("autocomplete_nvim").setup({})
```

也可以用 `:AutocompleteNvimStop` 停止，再调用 `setup()` 重启。

### 状态栏

配合 lualine 或自定义状态栏使用：

```lua
require("lualine").setup({
  sections = {
    lualine_x = {
      require("autocomplete_nvim.status").statusline_component,
    },
  },
})
```

## 审计面板

在配置中设置 `audit.enabled` 为 true 后，`:AutocompleteNvimAudit` 会在浏览器中打开 `http://127.0.0.1:3210/audit` 面板，展示：

- 请求耗时和延迟统计
- 发送给模型的 prefix/suffix 和上下文
- 原始补全结果和经过后处理的显示结果
- 补全被过滤的原因
- 软超时、复用命中/原因、首 token/LLM 耗时等字段
- 通过 SSE 实时更新
- 内置 FIM 演示，可在面板中直接测试补全

审计系统支持两种存储后端：

- **SQLite**（优先）：Node.js 22.5+ 自动启用，记录在守护进程重启后保留
- **内存**：SQLite 不可用时自动回退，守护进程退出后记录丢失，但面板功能完整

## 备注

- 目前仅支持 DeepSeek FIM。`apiBase` 使用 `https://api.deepseek.com/beta`。
- 插件不会从 `plugin/autocomplete_nvim.lua` 自动启动，需显式调用 `setup()`。
- 使用 `blink.cmp` 或 `nvim-cmp` 时，无 ghost text 时 Tab 键会委托给它们处理。
- `setup()` 是幂等的：再次调用会干净地停止前一个实例并以新配置重启。
