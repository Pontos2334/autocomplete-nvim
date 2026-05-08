if vim.g.loaded_autocomplete_nvim == 1 then
  return
end
vim.g.loaded_autocomplete_nvim = 1

-- Users can call require("autocomplete_nvim").setup({}) manually. This plugin
-- file intentionally does not auto-start to avoid surprising API calls.
