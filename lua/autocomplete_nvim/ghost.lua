local config = require("autocomplete_nvim.config")
local util = require("autocomplete_nvim.util")

local M = {}
local ns = vim.api.nvim_create_namespace("autocomplete_nvim_ghost")
M.current = nil

function M.clear()
  if M.current and vim.api.nvim_buf_is_valid(M.current.bufnr) then
    vim.api.nvim_buf_clear_namespace(M.current.bufnr, ns, 0, -1)
  end
  M.current = nil
end

function M.show(bufnr, item)
  M.clear()
  if not item or not item.completion or item.completion == "" then
    return
  end
  local pos = item.range and item.range.start or item.pos
  if not pos then
    return
  end
  local byte_col = util.position_to_byte(bufnr, pos)
  local lines = vim.split(item.completion, "\n", { plain = true })
  local first = lines[1] or ""
  local opts = config.get()
  local extmark = {
    virt_text = { { first, opts.ghost_text.hl_group } },
    virt_text_pos = "inline",
    hl_mode = "combine",
    invalidate = true,
  }
  if #lines > 1 then
    local virtual_lines = {}
    for i = 2, #lines do
      table.insert(virtual_lines, { { lines[i], opts.ghost_text.hl_group } })
    end
    extmark.virt_lines = virtual_lines
    extmark.virt_lines_above = false
  end
  local ok = pcall(vim.api.nvim_buf_set_extmark, bufnr, ns, pos.line, byte_col, extmark)
  if not ok then
    extmark.virt_text_pos = "eol"
    extmark.virt_lines = nil
    pcall(vim.api.nvim_buf_set_extmark, bufnr, ns, pos.line, byte_col, extmark)
  end
  M.current = {
    bufnr = bufnr,
    item = item,
  }
end

--- Check whether ghost text is available for acceptance without modifying buffer state.
---@return boolean
function M.can_accept()
  if not M.current then
    return false
  end
  if not vim.api.nvim_buf_is_valid(M.current.bufnr) then
    return false
  end
  return true
end

function M.accept()
  local current = M.current
  if not current or not vim.api.nvim_buf_is_valid(current.bufnr) then
    return false
  end
  local item = current.item
  local start_pos = item.range.start
  local end_pos = item.range["end"] or item.range.end_
  local start_byte = util.position_to_byte(current.bufnr, start_pos)
  local end_byte = util.position_to_byte(current.bufnr, end_pos)
  local replacement = vim.split(item.completion, "\n", { plain = true })
  local ok, err = pcall(vim.api.nvim_buf_set_text,
    current.bufnr,
    start_pos.line,
    start_byte,
    end_pos.line,
    end_byte,
    replacement
  )
  if not ok then
    return false, err
  end
  M.clear()
  return true, item
end

return M
