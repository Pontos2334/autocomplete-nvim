# autocomplete.nvim

Neovim inline AI autocomplete backed by a Node.js DeepSeek FIM daemon.

Inspired by [Continue](https://github.com/continuedev/continue) (Apache 2.0), reusing ideas including FIM prefix/suffix construction, suffix-aware rendering, streaming SSE handling, lightweight caching, and an audit dashboard.

[中文文档](README.md)

## Features

- Inline ghost text via Neovim extmarks.
- `Tab` accept with fallback to normal Tab behavior and nvim-cmp integration.
- `Ctrl-e` dismiss ghost text without moving cursor.
- Automatic debounce trigger in insert mode.
- Manual trigger command and keymap.
- DeepSeek FIM support using `~/.config/nvim/autocomplete-nvim.json`.
- LSP/import definition snippets plus recent edit/visit, open-buffer, and workspace config snippets.
- Audit dashboard with SQLite when available and memory fallback otherwise.
- Request reuse, chain completion, enter/backspace trigger delays, and optional statusline state.
- Graceful stop/restart without restarting Neovim.

## Requirements

- Neovim 0.11+
- Node.js 20+; Node 24 is verified in this workspace
- A DeepSeek FIM config at `~/.config/nvim/autocomplete-nvim.json`

Example config:

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

## Build

```sh
cd server
npm install
npm run build
```

## Test

```sh
cd server
npm test
```

Lua smoke tests can be run from the project root:

```sh
for t in tests/lua/test_*.lua; do
  nvim --headless -u NONE --cmd "set rtp+=." -l "$t"
done
```

## Installation

With [lazy.nvim](https://lazy.folke.io):

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

> **Note:** Requires Node.js 20+ installed on your system. The `build` step compiles the bundled TypeScript server automatically on install.

### Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable the plugin |
| `debounce_delay` | `350` | Delay in ms before triggering completion after normal typing |
| `enter_trigger_delay` | `120` | Delay in ms after Enter/newline (falls back to `debounce_delay` if 0) |
| `backspace_trigger_delay` | `180` | Delay in ms after backspace/deletion (falls back to `debounce_delay` if 0) |
| `chain_completion_delay` | `0` | Delay in ms to trigger next completion after accepting (0 = disabled) |
| `node_command` | `"node"` | Path to Node.js binary |
| `config_path` | `~/.config/nvim/autocomplete-nvim.json` | Path to config file |
| `keymaps.accept` | `"<Tab>"` | Accept ghost text keymap |
| `keymaps.dismiss` | `"<C-e>"` | Dismiss ghost text keymap |
| `keymaps.trigger` | `"<C-M-Space>"` | Manual trigger keymap |
| `keymaps.open_audit` | `nil` | Open audit dashboard keymap |
| `ghost_text.hl_group` | `"Comment"` | Highlight group for ghost text |
| `filetypes` | `nil` | Whitelist of filetypes (nil = all) |
| `disable_in_files` | `{}` | List of glob patterns to disable completions (e.g. `{"*.md", "node_modules/**"}`) |
| `context.enabled` | `true` | Include lightweight related-code context |
| `context.include_imports` | `true` | Resolve import/require/use symbols through LSP definitions |
| `context.include_open_buffers` | `true` | Include snippets from recently opened buffers |
| `context.include_workspace_config` | `true` | Include small project config files like `package.json` or `go.mod` |
| `context.timeout_ms` | `100` | Context collection timeout in ms |
| `context.max_snippets` | `8` | Max snippets per context bucket |
| `context.max_snippet_chars` | `4000` | Max chars for one context snippet |
| `context.max_total_chars` | `12000` | Max chars for collected context before server-side pruning |
| `notify` | `true` | Show notification messages |

Server-side `options.showWhateverWeHaveAtMs` defaults to `0`. Set it in `~/.config/nvim/autocomplete-nvim.json` to return partial streamed content after a soft timeout.

### Commands

- `:AutocompleteNvimTrigger` - Manually trigger a completion
- `:AutocompleteNvimReload` - Reload configuration from disk
- `:AutocompleteNvimAudit` - Open the audit dashboard in browser
- `:AutocompleteNvimStop` - Stop the plugin (call `setup()` again to restart)

### Stop / Restart

```lua
-- Stop the plugin
require("autocomplete_nvim").stop()

-- Restart it
require("autocomplete_nvim").setup({})
```

Or use `:AutocompleteNvimStop` to stop, then call `setup()` to restart.

### Statusline

For lualine or a custom statusline:

```lua
require("lualine").setup({
  sections = {
    lualine_x = {
      require("autocomplete_nvim.status").statusline_component,
    },
  },
})
```

## Audit Dashboard

When `audit.enabled` is true in your config, `:AutocompleteNvimAudit` opens a web dashboard at `http://127.0.0.1:3210/audit`. The dashboard shows:

- Request timing and latency stats
- Prefix/suffix and prompt context sent to the model
- Raw completion and displayed completion after post-processing
- Filter reasons when completions are dropped
- Soft timeout, reuse hit/reason, and first-token/LLM timing fields
- Real-time updates via SSE
- Built-in FIM demo for testing completions from the dashboard

The audit system supports two storage backends:

- **SQLite** (preferred): Used automatically when `node:sqlite` is available (Node.js 22.5+). Records persist across daemon restarts.
- **Memory**: Falls back automatically when SQLite is not available. Records are lost when the daemon exits, but the dashboard still works fully.

## Notes

- MVP supports DeepSeek FIM only. Use `https://api.deepseek.com/beta` as `apiBase`.
- The plugin does not auto-start from `plugin/autocomplete_nvim.lua`; call `setup()` explicitly.
- When using `blink.cmp` or `nvim-cmp`, the Tab key delegates to them when no ghost text is visible.
- `setup()` is idempotent: calling it again stops the previous instance cleanly and restarts with new options.
