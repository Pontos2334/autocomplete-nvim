# autocomplete.nvim

Neovim inline AI autocomplete MVP backed by a Node.js DeepSeek FIM daemon.

This project is intentionally separate from `autocomplete-vscode`, but reuses its important ideas: FIM prefix/suffix construction, suffix-aware rendering, streaming SSE handling, lightweight caching, and an audit dashboard for debugging prompt and completion behavior.

## Features

- Inline ghost text via Neovim extmarks.
- `Tab` accept with fallback to normal Tab behavior and nvim-cmp integration.
- `Ctrl-e` dismiss ghost text without moving cursor.
- Automatic debounce trigger in insert mode.
- Manual trigger command and keymap.
- DeepSeek FIM support using `~/.autocomplete-vscode/config.json`.
- LSP definition snippets plus recent edit/visit snippets.
- Audit dashboard with SQLite when available and memory fallback otherwise.
- Graceful stop/restart without restarting Neovim.

## Requirements

- Neovim 0.11+
- Node.js 20+; Node 24 is verified in this workspace
- A DeepSeek FIM config at `~/.autocomplete-vscode/config.json`

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

```powershell
$tests = Get-ChildItem -Path tests\lua\test_*.lua | Sort-Object Name
foreach ($t in $tests) {
  nvim --headless -u NONE --cmd "set rtp+=F:/programming-file/autocomplete-nvim" -l $t.FullName
}
```

## Setup

With lazy.nvim:

```lua
{
  dir = "F:/programming-file/autocomplete-nvim",
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

### Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable the plugin |
| `debounce_delay` | `350` | Delay in ms before triggering completion |
| `node_command` | `"node"` | Path to Node.js binary |
| `config_path` | `~/.autocomplete-vscode/config.json` | Path to config file |
| `keymaps.accept` | `"<Tab>"` | Accept ghost text keymap |
| `keymaps.dismiss` | `"<C-e>"` | Dismiss ghost text keymap |
| `keymaps.trigger` | `"<C-M-Space>"` | Manual trigger keymap |
| `keymaps.open_audit` | `nil` | Open audit dashboard keymap |
| `ghost_text.hl_group` | `"Comment"` | Highlight group for ghost text |
| `filetypes` | `nil` | Whitelist of filetypes (nil = all) |
| `notify` | `true` | Show notification messages |

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

## Audit Dashboard

When `audit.enabled` is true in your config, `:AutocompleteNvimAudit` opens a web dashboard at `http://127.0.0.1:3210/audit`. The dashboard shows:

- Request timing and latency stats
- Prefix/suffix and prompt context sent to the model
- Raw completion and displayed completion after post-processing
- Filter reasons when completions are dropped
- Real-time updates via SSE

If `node:sqlite` is unavailable, audit records are kept in memory and the dashboard still works.

## Notes

- MVP supports DeepSeek FIM only. Use `https://api.deepseek.com/beta` as `apiBase`.
- The plugin does not auto-start from `plugin/autocomplete_nvim.lua`; call `setup()` explicitly.
- When using `blink.cmp` or `nvim-cmp`, the Tab key delegates to them when no ghost text is visible.
