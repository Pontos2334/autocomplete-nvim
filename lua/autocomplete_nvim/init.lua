local config = require("autocomplete_nvim.config")
local util = require("autocomplete_nvim.util")
local rpc = require("autocomplete_nvim.rpc")
local ghost = require("autocomplete_nvim.ghost")
local context = require("autocomplete_nvim.context")
local status = require("autocomplete_nvim.status")

local M = {}
local augroup = vim.api.nvim_create_augroup("autocomplete_nvim", { clear = true })
local debounce_timer = nil
local active_completion_id = nil
local trigger_epoch = 0
local _last_auto_error_shown = false
local _setup_done = false
local buf_state = {} -- per-buffer state tracking for trigger type detection

local function set_idle_or_disabled()
  if config.get().enabled == false then
    status.disabled()
  else
    status.idle()
  end
end

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
  if opts.disable_in_files and #opts.disable_in_files > 0 then
    local filepath = vim.api.nvim_buf_get_name(bufnr)
    for _, pattern in ipairs(opts.disable_in_files) do
      if util.matches_glob(filepath, pattern) then
        return false
      end
    end
  end
  return vim.bo[bufnr].buftype == ""
end

local function cancel_active_completion()
  if active_completion_id then
    local old_id = active_completion_id
    active_completion_id = nil
    rpc.request_async("cancel", { completionId = old_id }, function() end, 1000)
  end
end

local function build_params(bufnr, manual, collected_context, is_chain)
  local pos = util.cursor_position_utf16(bufnr)
  local collected = collected_context or context.snapshot()
  return vim.tbl_extend("force", collected, {
    completionId = tostring(vim.loop.hrtime()),
    filepath = util.buf_file_uri(bufnr),
    text = util.buf_get_text(bufnr),
    pos = {
      line = pos.line,
      character = pos.character,
    },
    workspaceDirs = util.workspace_dirs(),
    manuallyTriggered = manual or false,
    isChainCompletion = is_chain or false,
    isUntitledFile = vim.api.nvim_buf_get_name(bufnr) == "",
  })
end

function M.trigger(manual, is_chain)
  local bufnr = vim.api.nvim_get_current_buf()
  if not should_run(bufnr) and not manual then
    return
  end
  trigger_epoch = trigger_epoch + 1
  local epoch = trigger_epoch
  -- Only cancel on manual trigger; auto-trigger lets the server's
  -- GeneratorReuseManager decide whether to reuse the in-flight request.
  if manual then
    cancel_active_completion()
  end
  ghost.clear()
  context.collect(bufnr, function(collected_context)
    if epoch ~= trigger_epoch then
      return
    end
    if not vim.api.nvim_buf_is_valid(bufnr) or (not manual and not should_run(bufnr)) then
      return
    end
    local params = build_params(bufnr, manual, collected_context, is_chain)
    active_completion_id = params.completionId
    status.loading()
    rpc.request_async("complete", params, function(result, err)
      if epoch ~= trigger_epoch then
        return
      end
      if err then
        status.error(err)
        if manual then
          util.notify(err.message or vim.inspect(err), vim.log.levels.WARN)
        elseif not _last_auto_error_shown then
          _last_auto_error_shown = true
          util.notify("Autocomplete error: " .. (err.message or "unknown"), vim.log.levels.WARN)
        end
        return
      end
      _last_auto_error_shown = false
      status.idle()
      if type(result) == "table" and result.completionId and active_completion_id == result.completionId and vim.api.nvim_get_mode().mode == "i" then
        ghost.show(bufnr, result)
      end
    end, 60000)
  end)
end

local function schedule_trigger_with_delay(delay)
  if debounce_timer then
    debounce_timer:stop()
  else
    debounce_timer = vim.loop.new_timer()
  end
  debounce_timer:start(delay, 0, function()
    vim.schedule(function()
      M.trigger(false)
    end)
  end)
end

local function schedule_trigger()
  local opts = config.get()
  schedule_trigger_with_delay(opts.debounce_delay)
end

local function update_buf_state(bufnr)
  local line_count = vim.api.nvim_buf_line_count(bufnr)
  local text = table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")
  local changedtick = vim.b[bufnr].changedtick or 0
  local state = buf_state[bufnr]
  local prev = state or { line_count = 0, text_len = 0, changedtick = 0 }
  buf_state[bufnr] = {
    line_count = line_count,
    text_len = #text,
    changedtick = changedtick,
  }
  return prev, buf_state[bufnr]
end

local function detect_trigger_delay(bufnr)
  local opts = config.get()
  local prev, cur = update_buf_state(bufnr)
  if not prev or prev.changedtick == 0 then
    return opts.debounce_delay
  end
  -- Lines increased: likely an Enter/newline
  if cur.line_count > prev.line_count then
    return opts.enter_trigger_delay > 0 and opts.enter_trigger_delay or opts.debounce_delay
  end
  -- Text got shorter: likely a backspace/deletion
  if cur.text_len < prev.text_len then
    return opts.backspace_trigger_delay > 0 and opts.backspace_trigger_delay or opts.debounce_delay
  end
  return opts.debounce_delay
end

local accept_current_completion -- forward declaration

function M.accept()
  return accept_current_completion()
end

accept_current_completion = function()
  local ok, item = ghost.accept()
  if ok then
    active_completion_id = nil
    rpc.request_async("accept", { completionId = item.completionId }, function() end, 1000)

    -- Chain completion: trigger next completion after delay
    local opts = config.get()
    if opts.chain_completion_delay and opts.chain_completion_delay > 0 then
      local bufnr = vim.api.nvim_get_current_buf()
      vim.defer_fn(function()
        if vim.api.nvim_buf_is_valid(bufnr)
            and vim.api.nvim_get_mode().mode == "i"
            and should_run(bufnr) then
          M.trigger(false, true)
        end
      end, opts.chain_completion_delay)
    end

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
      status.error(err)
    elseif result then
      util.notify("autocomplete.nvim config reloaded")
      set_idle_or_disabled()
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
  trigger_epoch = trigger_epoch + 1
  cancel_active_completion()
  rpc.stop()
  status.disabled()
  augroup = vim.api.nvim_create_augroup("autocomplete_nvim", { clear = true })
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
    trigger_epoch = trigger_epoch + 1
    cancel_active_completion()
    clear_keymaps()
    rpc.stop()
  end
  _setup_done = true

  augroup = vim.api.nvim_create_augroup("autocomplete_nvim", { clear = true })
  config.setup(opts)
  set_idle_or_disabled()
  rpc.initialize()
  vim.api.nvim_create_autocmd({ "TextChangedI" }, {
    group = augroup,
    callback = function(args)
      context.remember_edit(args.buf)
      local delay = detect_trigger_delay(args.buf)
      schedule_trigger_with_delay(delay)
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
      trigger_epoch = trigger_epoch + 1
      cancel_active_completion()
      set_idle_or_disabled()
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
    accept_current_completion()
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
      cancel_active_completion()
      ghost.clear()
      set_idle_or_disabled()
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
