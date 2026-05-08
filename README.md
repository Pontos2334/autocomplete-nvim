# autocomplete.nvim

Neovim inline AI autocomplete MVP backed by a Node.js DeepSeek FIM daemon.

This project is intentionally separate from `autocomplete-vscode`, but reuses its important ideas: FIM prefix/suffix construction, suffix-aware rendering, streaming SSE handling, lightweight caching, and an audit dashboard for debugging prompt and completion behavior.

## Features

- Inline ghost text via Neovim extmarks.
- `Tab` accept with fallback to normal Tab behavior.
- Automatic debounce trigger in insert mode.
- Manual trigger command and keymap.
- DeepSeek FIM support using `~/.autocomplete-vscode/config.json`.
- LSP definition snippets plus recent edit/visit snippets.
- Audit dashboard with SQLite when available and memory fallback otherwise.

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
        trigger = "<C-M-Space>",
        open_audit = "<leader>aa",
      },
    })
  end,
}
```

Manual commands:

- `:AutocompleteNvimTrigger`
- `:AutocompleteNvimReload`
- `:AutocompleteNvimAudit`

When audit is enabled, `:AutocompleteNvimAudit` opens the dashboard URL returned by the daemon. The dashboard shows request timing, prefix/suffix, prompt context, raw completion, displayed completion, filter reasons, and errors.

## Notes

- MVP supports DeepSeek FIM only. Use `https://api.deepseek.com/beta` as `apiBase`.
- The plugin does not auto-start from `plugin/autocomplete_nvim.lua`; call `setup()` explicitly.
- Audit dashboard is available only when `audit.enabled` is true.
- If `node:sqlite` is unavailable or fails, audit records are kept in memory and the dashboard still works.
