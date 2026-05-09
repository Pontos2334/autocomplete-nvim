# Changelog - autocomplete.nvim

## 0.2.0 (2025-05-09)

### Bug Fixes

- **Fixed initialize timeout on startup** - Server now starts reading stdin before completing audit initialization, preventing the 10-second timeout that appeared when first loading the plugin.
- **Fixed garbled DeepSeek stop token** - Corrected a UTF-8 encoding corruption in the FIM stop token (`<|end_of_sentence|>`), which caused the model to generate unwanted trailing text instead of stopping cleanly.
- **Fixed E565 textlock error on Tab accept** - Ghost text acceptance no longer triggers Neovim's textlock. Buffer writes are now deferred through a `<Plug>` mapping bridge, eliminating the error when accepting completions in insert mode.
- **Fixed crash on empty completion results** - Server returns JSON `null` for filtered/empty completions, which `vim.json.decode` converts to `vim.NIL` (a truthy userdata). This is now normalized to Lua `nil` at the RPC layer, preventing field access errors.
- **Fixed server crash going unnoticed** - When the Node.js daemon exits unexpectedly, users now see a warning notification and the server automatically re-initializes on the next trigger.

### New Features

- **Plugin stop/restart** - Added `:AutocompleteNvimStop` command and `M.stop()` API to fully disable the plugin without restarting Neovim. Call `setup()` again to re-enable.
- **Dismiss ghost text with Ctrl-E** - Press `<C-e>` in insert mode to dismiss the current ghost text suggestion without moving your cursor. Configurable via `keymaps.dismiss`.
- **nvim-cmp Tab compatibility** - When no ghost text is visible, the Tab key now delegates to nvim-cmp if it's loaded and its completion menu is open, instead of inserting a raw tab character.
- **Audit dashboard** - The audit web dashboard is now available when `audit.enabled` is set to `true` in your config. Open it with `:AutocompleteNvimAudit` or `<leader>aa`.

### Improvements

- **Removed 20,000+ lines of dead code** - Cleaned up 114 unused files copied from autocomplete-vscode, reducing the repo to just the essential MVP code.
- **Cache size limit** - Completion cache is now capped at 200 entries to prevent unbounded memory growth during long daemon sessions.
- **Context memory limit** - File visit context snippets are now truncated at 4,000 characters to prevent memory bloat when editing files with very long lines.
- **Setup idempotency** - Calling `setup()` multiple times no longer creates duplicate autocmds or keymaps. Previous state is properly cleaned up first.
- **Test coverage** - Expanded from 3 server tests and 5 Lua tests to 21 server tests and 28 Lua tests, covering channel-lines parsing, ghost text lifecycle, vim.NIL handling, and setup guard behavior.

### Breaking Changes

- **Minimum Neovim version**: 0.11+ (unchanged)
- **Minimum Node.js version**: 20+ (unchanged)
- No configuration breaking changes. Existing `setup()` calls work as before.
