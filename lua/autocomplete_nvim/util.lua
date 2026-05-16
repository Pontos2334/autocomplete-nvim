local M = {}

local _text_cache = {}

function M.buf_get_text(bufnr)
  local tick = vim.b[bufnr].changedtick
  local cached = _text_cache[bufnr]
  if cached and cached.tick == tick then
    return cached.text
  end
  local text = table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")
  _text_cache[bufnr] = { text = text, tick = tick }
  return text
end

function M.invalidate_text_cache(bufnr)
  _text_cache[bufnr] = nil
end

function M.buf_file_uri(bufnr)
  local name = vim.api.nvim_buf_get_name(bufnr)
  if name == "" then
    return "file:///Untitled"
  end
  local ok, uri = pcall(vim.uri_from_fname, name)
  return ok and uri or name
end

function M.workspace_dirs()
  local dirs = {}
  for _, folder in ipairs(vim.lsp.buf.list_workspace_folders(0) or {}) do
    table.insert(dirs, folder)
  end
  if #dirs == 0 then
    local cwd = vim.loop.cwd() or vim.fn.getcwd()
    table.insert(dirs, vim.uri_from_fname(cwd))
  end
  return dirs
end

function M.byte_to_utf16(line, byte_col)
  byte_col = math.max(0, math.min(byte_col, #line))
  local ok, utf32, utf16 = pcall(vim.str_utfindex, line, byte_col)
  if ok then
    return utf16 or utf32 or byte_col
  end
  return byte_col
end

function M.utf16_to_byte(line, utf16_col)
  utf16_col = math.max(0, utf16_col)
  if utf16_col == 0 then
    return 0
  end
  local ok, idx = pcall(vim.str_byteindex, line, utf16_col, true)
  if ok and idx then
    return idx
  end
  return #line
end

function M.cursor_position_utf16(bufnr)
  local cursor = vim.api.nvim_win_get_cursor(0)
  local line_nr = cursor[1] - 1
  local byte_col = cursor[2]
  local line = vim.api.nvim_buf_get_lines(bufnr, line_nr, line_nr + 1, false)[1] or ""
  return {
    line = line_nr,
    character = M.byte_to_utf16(line, byte_col),
    byte_col = byte_col,
  }
end

function M.position_to_byte(bufnr, pos)
  local line = vim.api.nvim_buf_get_lines(bufnr, pos.line, pos.line + 1, false)[1] or ""
  return M.utf16_to_byte(line, pos.character or 0)
end

function M.notify(message, level)
  local ok_config, config = pcall(require, "autocomplete_nvim.config")
  if ok_config and config.get().notify == false then
    return
  end
  vim.schedule(function()
    vim.notify(message, level or vim.log.levels.INFO, { title = "autocomplete.nvim" })
  end)
end

--- Glob matching supporting:
---   *.ext        — any file with that extension
---   name/**      — any file under a directory (at any nesting depth)
---   exact/path   — exact path suffix match
---
--- Lua patterns don't support alternation (|), so for non-wildcard prefixes
--- we check both "^pattern" and "/pattern" suffix matches.
function M.matches_glob(filepath, pattern)
  local result = {}
  local i = 1
  while i <= #pattern do
    if pattern:sub(i, i + 1) == "**" then
      result[#result + 1] = ".*"
      i = i + 2
    elseif pattern:sub(i, i) == "*" then
      result[#result + 1] = "[^/]*"
      i = i + 1
    else
      local ch = pattern:sub(i, i)
      if ch:match("[%^%$%(%)%%%.%[%]%+%-]") then
        result[#result + 1] = "%" .. ch
      else
        result[#result + 1] = ch
      end
      i = i + 1
    end
  end
  result[#result + 1] = "$"
  local p = table.concat(result)

  local first_char = pattern:sub(1, 1)
  if first_char == "*" then
    return filepath:match(p) ~= nil
  else
    -- Non-wildcard prefix: match at string start OR after a /
    return filepath:match("^" .. p) ~= nil or filepath:match("/" .. p) ~= nil
  end
end

return M
