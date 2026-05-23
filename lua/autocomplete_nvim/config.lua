local M = {}

M.defaults = {
  enabled = true,
  debounce_delay = 350,
  enter_trigger_delay = 120,
  backspace_trigger_delay = 180,
  node_command = "node",
  server_path = nil,
  config_path = vim.fn.stdpath("config") .. "/autocomplete-nvim.json",
  filetypes = nil,
  keymaps = {
    accept = "<Tab>",
    dismiss = "<C-e>",
    trigger = "<C-M-Space>",
    open_audit = nil,
  },
  ghost_text = {
    hl_group = "Comment",
  },
  max_lsp_snippets = 3,
  max_recent_files = 3,
  max_recent_edits = 3,
  chain_completion_delay = 0,
  notify = true,
  disable_in_files = {},
  context = {
    enabled = true,
    include_imports = true,
    include_open_buffers = true,
    include_workspace_config = true,
    timeout_ms = 100,
    max_snippets = 8,
    max_snippet_chars = 4000,
    max_total_chars = 12000,
  },
}

M.options = vim.deepcopy(M.defaults)

local function is_list(value)
  if type(value) ~= "table" then
    return false
  end
  if vim.islist then
    return vim.islist(value)
  end
  return value[1] ~= nil
end

local function merge(base, override)
  local result = vim.deepcopy(base)
  for key, value in pairs(override or {}) do
    if type(value) == "table" and type(result[key]) == "table" and not is_list(value) then
      result[key] = merge(result[key], value)
    else
      result[key] = value
    end
  end
  return result
end

function M.setup(opts)
  M.options = merge(M.defaults, opts or {})
  if not M.options.server_path then
    local source = debug.getinfo(1, "S").source:sub(2)
    local plugin_root = vim.fn.fnamemodify(source, ":h:h:h")
    M.options.server_path = plugin_root .. "/server/dist/daemon.js"
  end
  return M.options
end

function M.get()
  return M.options
end

return M
