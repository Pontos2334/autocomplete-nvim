local M = {}

M.defaults = {
  enabled = true,
  debounce_delay = 350,
  node_command = "node",
  server_path = nil,
  config_path = nil,
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
  notify = true,
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
