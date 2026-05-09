local config = require("autocomplete_nvim.config")
local util = require("autocomplete_nvim.util")
local rpc = require("autocomplete_nvim.rpc")
local ghost = require("autocomplete_nvim.ghost")
local context = require("autocomplete_nvim.context")

local M = {}
local augroup = vim.api.nvim_create_augroup("autocomplete_nvim", { clear = true })
local debounce_timer = nil
local active_completion_id = nil
local _setup_done = false

local function should_run(bufnr)
  local opts = config.get()
  if not opts.enabled then
    return false
  end
  if vim.api.nvim_get_mode().mode ~= "i" then
    return false
  end
  if opts.filetypes and not vim.tbl_contains(opts.filetypes, vim.bo[bufnr].filetype) then
    return false
  end
  return vim.bo[bufnr].buftype == ""
end

local function build_params(bufnr, manual, lsp_snippets)
  local pos = util.cursor_position_utf16(bufnr)
  local snap = context.snapshot()
  return vim.tbl_extend("force", snap, {
    completionId = tostring(vim.loop.hrtime()),
    filepath = util.buf_file_uri(bufnr),
    text = util.buf_get_text(bufnr),
    pos = {
      line = pos.line,
      character = pos.character,
    },
    workspaceDirs = util.workspace_dirs(),
    lspSnippets = lsp_snippets or {},
    manuallyTriggered = manual or false,
    isUntitledFile = vim.api.nvim_buf_get_name(bufnr) == "",
  })
end

function M.trigger(manual)
  local bufnr = vim.api.nvim_get_current_buf()
  if not should_run(bufnr) and not manual then
    return
  end
  if active_completion_id then
    rpc.request_async("cancel", { completionId = active_completion_id }, function() end, 1000)
  end
  ghost.clear()
  context.lsp_definition_snippets(bufnr, function(lsp_snippets)
    if not vim.api.nvim_buf_is_valid(bufnr) or (not manual and not should_run(bufnr)) then
      return
    end
    local params = build_params(bufnr, manual, lsp_snippets)
    active_completion_id = params.completionId
    rpc.request_async("complete", params, function(result, err)
      if err then
        if manual then
          util.notify(err.message or vim.inspect(err), vim.log.levels.WARN)
        end
        return
      end
      if type(result) == "table" and result.completionId and active_completion_id == result.completionId and vim.api.nvim_get_mode().mode == "i" then
        ghost.show(bufnr, result)
      end
    end, 60000)
  end)
end

local function schedule_trigger()
  local opts = config.get()
  if debounce_timer then
    debounce_timer:stop()
  else
    debounce_timer = vim.loop.new_timer()
  end
  debounce_timer:start(opts.debounce_delay, 0, function()
    vim.schedule(function()
      M.trigger(false)
    end)
  end)
end

function M.accept()
  local ok, item = ghost.accept()
  if ok then
    active_completion_id = nil
    rpc.request_async("accept", { completionId = item.completionId }, function() end, 1000)
    return true
  end
  return false
end

function M.open_audit()
  rpc.request_async("getAuditInfo", {}, function(result, err)
    if err or not result or not result.url then
      util.notify("Audit dashboard is not enabled", vim.log.levels.WARN)
      return
    end
    vim.ui.open(result.url)
  end, 3000)
end

function M.reload_config()
  rpc.request_async("reloadConfig", { configPath = config.get().config_path }, function(result, err)
    if err then
      util.notify("reload failed: " .. (err.message or vim.inspect(err)), vim.log.levels.WARN)
    elseif result then
      util.notify("autocomplete.nvim config reloaded")
    end
  end, 3000)
end

local function clear_keymaps()
  pcall(vim.keymap.del, "i", "<Plug>(autocomplete_nvim_accept)")
  local keymaps = config.get().keymaps
  if keymaps.accept then
    pcall(vim.keymap.del, "i", keymaps.accept)
  end
  if keymaps.dismiss then
    pcall(vim.keymap.del, "i", keymaps.dismiss)
  end
  if keymaps.trigger then
    pcall(vim.keymap.del, "i", keymaps.trigger)
  end
  if keymaps.open_audit then
    pcall(vim.keymap.del, "n", keymaps.open_audit)
  end
end

function M.stop()
  if debounce_timer then
    debounce_timer:stop()
    debounce_timer:close()
    debounce_timer = nil
  end
  ghost.clear()
  if active_completion_id then
    rpc.request_async("cancel", { completionId = active_completion_id }, function() end, 1000)
    active_completion_id = nil
  end
  rpc.stop()
  vim.api.nvim_create_augroup("autocomplete_nvim", { clear = true })
  clear_keymaps()
  _setup_done = false
end

function M.setup(opts)
  if _setup_done then
    if debounce_timer then
      debounce_timer:stop()
      debounce_timer:close()
      debounce_timer = nil
    end
    ghost.clear()
    if active_completion_id then
      rpc.request_async("cancel", { completionId = active_completion_id }, function() end, 1000)
      active_completion_id = nil
    end
    clear_keymaps()
  end
  _setup_done = true

  config.setup(opts)
  rpc.initialize()
  vim.api.nvim_create_autocmd({ "TextChangedI" }, {
    group = augroup,
    callback = function(args)
      context.remember_edit(args.buf)
      schedule_trigger()
    end,
  })
  vim.api.nvim_create_autocmd({ "CursorMovedI" }, {
    group = augroup,
    callback = function()
      ghost.clear()
      schedule_trigger()
    end,
  })
  vim.api.nvim_create_autocmd({ "InsertLeave" }, {
    group = augroup,
    callback = function(args)
      context.remember_visit(args.buf)
      ghost.clear()
      if active_completion_id then
        rpc.request_async("cancel", { completionId = active_completion_id }, function() end, 1000)
        active_completion_id = nil
      end
    end,
  })
  vim.api.nvim_create_autocmd({ "BufLeave" }, {
    group = augroup,
    callback = function(args)
      context.remember_visit(args.buf)
    end,
  })

  local keymaps = config.get().keymaps
  -- <Plug> mapping: safe to modify buffer outside textlock
  vim.keymap.set("i", "<Plug>(autocomplete_nvim_accept)", function()
    local ok, item = ghost.accept()
    if ok then
      active_completion_id = nil
      rpc.request_async("accept", { completionId = item.completionId }, function() end, 1000)
    end
  end, { silent = true, desc = "Accept autocomplete.nvim ghost text" })

  if keymaps.accept then
    vim.keymap.set("i", keymaps.accept, function()
      if ghost.can_accept() then
        vim.api.nvim_feedkeys(
          vim.api.nvim_replace_termcodes("<Plug>(autocomplete_nvim_accept)", true, false, true),
          "i",
          false
        )
        return ""
      end
      local has_cmp = pcall(require, "cmp")
      if has_cmp then
        local cmp = require("cmp")
        if cmp.visible() then
          cmp.confirm({ select = true })
          return ""
        end
      end
      if keymaps.accept == "<Tab>" then
        return "\t"
      end
      return keymaps.accept
    end, { expr = true, silent = true, desc = "Accept autocomplete.nvim ghost text" })
  end
  if keymaps.dismiss then
    vim.keymap.set("i", keymaps.dismiss, function()
      ghost.clear()
    end, { silent = true, desc = "Dismiss autocomplete.nvim ghost text" })
  end
  if keymaps.trigger then
    vim.keymap.set("i", keymaps.trigger, function()
      M.trigger(true)
    end, { silent = true, desc = "Trigger autocomplete.nvim" })
  end
  if keymaps.open_audit then
    vim.keymap.set("n", keymaps.open_audit, M.open_audit, { silent = true, desc = "Open autocomplete.nvim audit" })
  end

  vim.api.nvim_create_user_command("AutocompleteNvimTrigger", function()
    M.trigger(true)
  end, {})
  vim.api.nvim_create_user_command("AutocompleteNvimReload", function()
    M.reload_config()
  end, {})
  vim.api.nvim_create_user_command("AutocompleteNvimAudit", function()
    M.open_audit()
  end, {})
  vim.api.nvim_create_user_command("AutocompleteNvimStop", function()
    M.stop()
    util.notify("autocomplete.nvim stopped")
  end, {})
end

return M
