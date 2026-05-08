local util = require("autocomplete_nvim.util")
local config = require("autocomplete_nvim.config")

local M = {
  recent_visits = {},
  recent_edits = {},
}

function M.remember_visit(bufnr)
  if not bufnr or not vim.api.nvim_buf_is_valid(bufnr) then
    return
  end
  local name = vim.api.nvim_buf_get_name(bufnr)
  if name == "" then
    return
  end
  local cursor = vim.api.nvim_win_get_cursor(0)
  local line = cursor[1] - 1
  local start_line = math.max(0, line - 20)
  local end_line = math.min(vim.api.nvim_buf_line_count(bufnr), line + 21)
  local content = table.concat(vim.api.nvim_buf_get_lines(bufnr, start_line, end_line, false), "\n")
  if content:match("%S") then
    table.insert(M.recent_visits, 1, {
      filepath = util.buf_file_uri(bufnr),
      content = content,
    })
    while #M.recent_visits > config.get().max_recent_files do
      table.remove(M.recent_visits)
    end
  end
end

function M.remember_edit(bufnr)
  if not bufnr or not vim.api.nvim_buf_is_valid(bufnr) then
    return
  end
  local cursor = vim.api.nvim_win_get_cursor(0)
  local line = cursor[1] - 1
  local start_line = math.max(0, line - 5)
  local end_line = math.min(vim.api.nvim_buf_line_count(bufnr), line + 6)
  local lines = vim.api.nvim_buf_get_lines(bufnr, start_line, end_line, false)
  table.insert(M.recent_edits, 1, {
    filepath = util.buf_file_uri(bufnr),
    range = {
      start = { line = start_line, character = 0 },
      ["end"] = { line = math.max(start_line, end_line - 1), character = 0 },
    },
    timestamp = vim.loop.now(),
    lines = lines,
  })
  while #M.recent_edits > config.get().max_recent_edits do
    table.remove(M.recent_edits)
  end
end

function M.lsp_definition_snippets(bufnr, callback)
  local params = vim.lsp.util.make_position_params(0, "utf-16")
  vim.lsp.buf_request_all(bufnr, "textDocument/definition", params, function(results)
    local snippets = {}
    for _, response in pairs(results or {}) do
      local result = response.result
      if result and not vim.tbl_islist(result) then
        result = { result }
      end
      for _, loc in ipairs(result or {}) do
        local uri = loc.targetUri or loc.uri
        local range = loc.targetRange or loc.range
        if uri and range and #snippets < config.get().max_lsp_snippets then
          local path = vim.uri_to_fname(uri)
          local ok, lines = pcall(vim.fn.readfile, path)
          if ok and lines then
            local start_line = math.max(0, range.start.line)
            local end_line = math.min(#lines, (range["end"] and range["end"].line or start_line) + 1)
            local selected = {}
            for i = start_line + 1, end_line do
              table.insert(selected, lines[i])
            end
            if table.concat(selected, "\n"):match("%S") then
              table.insert(snippets, {
                filepath = uri,
                content = table.concat(selected, "\n"),
              })
            end
          end
        end
      end
    end
    callback(snippets)
  end)
end

function M.snapshot()
  return {
    recentlyVisitedRanges = vim.deepcopy(M.recent_visits),
    recentlyEditedRanges = vim.deepcopy(M.recent_edits),
  }
end

return M
