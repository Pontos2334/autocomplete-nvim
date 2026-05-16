local util = require("autocomplete_nvim.util")
local config = require("autocomplete_nvim.config")

local M = {
  recent_visits = {},
  recent_edits = {},
}

local _file_cache = {}
local _FILE_CACHE_TTL = 2000

local function dedup_visit(visits, filepath, content)
  for i, v in ipairs(visits) do
    if v.filepath == filepath then
      if v.content == content then
        table.remove(visits, i)
      end
      break
    end
  end
end

local function dedup_edit(edits, filepath, start_line, end_line)
  for i, e in ipairs(edits) do
    if e.filepath == filepath then
      local e_start = e.range.start.line
      local e_end = e.range["end"].line
      if math.abs(e_start - start_line) <= 5 and math.abs(e_end - end_line) <= 5 then
        table.remove(edits, i)
      end
      break
    end
  end
end

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
  if #content > 4000 then
    content = content:sub(1, 4000)
  end
  if not content:match("%S") then
    return
  end
  local uri = util.buf_file_uri(bufnr)
  dedup_visit(M.recent_visits, uri, content)
  table.insert(M.recent_visits, 1, {
    filepath = uri,
    content = content,
  })
  while #M.recent_visits > config.get().max_recent_files do
    table.remove(M.recent_visits)
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
  local uri = util.buf_file_uri(bufnr)
  dedup_edit(M.recent_edits, uri, start_line, math.max(start_line, end_line - 1))
  table.insert(M.recent_edits, 1, {
    filepath = uri,
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

local function cached_readfile(filepath)
  local now = vim.loop.now()
  local cached = _file_cache[filepath]
  if cached and (now - cached.ts) < _FILE_CACHE_TTL then
    return cached.lines
  end
  local ok, lines = pcall(vim.fn.readfile, filepath)
  if not ok or not lines then
    _file_cache[filepath] = nil
    return nil
  end
  _file_cache[filepath] = { lines = lines, ts = now }
  return lines
end

local function context_options()
  local opts = config.get().context or {}
  return {
    enabled = opts.enabled ~= false,
    include_imports = opts.include_imports ~= false,
    include_open_buffers = opts.include_open_buffers ~= false,
    include_workspace_config = opts.include_workspace_config ~= false,
    timeout_ms = opts.timeout_ms or 100,
    max_snippets = opts.max_snippets or 8,
    max_snippet_chars = opts.max_snippet_chars or 4000,
    max_total_chars = opts.max_total_chars or 12000,
  }
end

local function has_lsp_clients(bufnr)
  if vim.lsp.get_clients then
    return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
  end
  if vim.lsp.get_active_clients then
    return #vim.lsp.get_active_clients({ bufnr = bufnr }) > 0
  end
  return false
end

local function limit_text(text, max_chars)
  if #text <= max_chars then
    return text
  end
  return text:sub(1, max_chars)
end

local function make_position_params(bufnr, line, character)
  return {
    textDocument = {
      uri = util.buf_file_uri(bufnr),
    },
    position = {
      line = line,
      character = character,
    },
  }
end

local function snippet_from_location(loc, opts)
  local uri = loc.targetUri or loc.uri
  local range = loc.targetRange or loc.range
  if not uri or not range then
    return nil
  end

  local ok, path = pcall(vim.uri_to_fname, uri)
  if not ok or not path then
    return nil
  end

  local lines = cached_readfile(path)
  if not lines then
    return nil
  end

  local start_line = math.max(0, range.start.line or 0)
  local end_line = math.min(#lines, ((range["end"] and range["end"].line) or start_line) + 1)
  local selected = {}
  for i = start_line + 1, end_line do
    table.insert(selected, lines[i])
  end

  local content = table.concat(selected, "\n")
  if not content:match("%S") then
    return nil
  end

  return {
    filepath = uri,
    content = limit_text(content, opts.max_snippet_chars),
  }
end

local function request_definition_snippets(bufnr, params, limit, callback)
  if not has_lsp_clients(bufnr) then
    callback({})
    return
  end

  local opts = context_options()
  vim.lsp.buf_request_all(bufnr, "textDocument/definition", params, function(results)
    local snippets = {}
    for _, response in pairs(results or {}) do
      local result = response.result
      if result and not vim.tbl_islist(result) then
        result = { result }
      end
      for _, loc in ipairs(result or {}) do
        if #snippets >= limit then
          break
        end
        local snippet = snippet_from_location(loc, opts)
        if snippet then
          table.insert(snippets, snippet)
        end
      end
    end
    callback(snippets)
  end)
end

function M.lsp_definition_snippets(bufnr, callback)
  local pos = util.cursor_position_utf16(bufnr)
  local params = make_position_params(bufnr, pos.line, pos.character)
  request_definition_snippets(bufnr, params, config.get().max_lsp_snippets, callback)
end

local function add_snippet(result, bucket, snippet, state, opts)
  if not snippet or not snippet.filepath or not snippet.content then
    return
  end
  local content = limit_text(snippet.content, opts.max_snippet_chars)
  if not content:match("%S") then
    return
  end
  if #result[bucket] >= opts.max_snippets or state.total_chars >= opts.max_total_chars then
    return
  end

  local key = snippet.filepath .. "\0" .. content
  if state.seen[key] then
    return
  end

  local remaining = opts.max_total_chars - state.total_chars
  if #content > remaining then
    content = content:sub(1, remaining)
  end
  if not content:match("%S") then
    return
  end

  state.seen[key] = true
  state.total_chars = state.total_chars + #content
  table.insert(result[bucket], {
    filepath = snippet.filepath,
    content = content,
  })
end

local function opened_file_snippets(bufnr, result, state, opts)
  local current_name = vim.api.nvim_buf_get_name(bufnr)
  for _, other in ipairs(vim.api.nvim_list_bufs()) do
    if #result.openedFileSnippets >= opts.max_snippets then
      return
    end
    if other ~= bufnr
        and vim.api.nvim_buf_is_valid(other)
        and vim.api.nvim_buf_is_loaded(other)
        and vim.bo[other].buftype == "" then
      local name = vim.api.nvim_buf_get_name(other)
      if name ~= "" and name ~= current_name then
        local line_count = math.min(vim.api.nvim_buf_line_count(other), 120)
        local content = table.concat(vim.api.nvim_buf_get_lines(other, 0, line_count, false), "\n")
        local ok, uri = pcall(vim.uri_from_fname, name)
        add_snippet(result, "openedFileSnippets", {
          filepath = ok and uri or name,
          content = content,
        }, state, opts)
      end
    end
  end
end

local function workspace_config_snippets(result, state, opts)
  local candidates = {
    "package.json",
    "tsconfig.json",
    "jsconfig.json",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
  }

  for _, dir_uri in ipairs(util.workspace_dirs()) do
    local ok, dir = pcall(vim.uri_to_fname, dir_uri)
    dir = ok and dir or dir_uri
    for _, filename in ipairs(candidates) do
      if #result.workspaceConfigSnippets >= opts.max_snippets then
        return
      end
      local filepath = dir .. "/" .. filename
      if vim.fn.filereadable(filepath) == 1 then
        local lines = cached_readfile(filepath)
        if lines then
          local ok_uri, uri = pcall(vim.uri_from_fname, filepath)
          add_snippet(result, "workspaceConfigSnippets", {
            filepath = ok_uri and uri or filepath,
            content = table.concat(lines, "\n"),
          }, state, opts)
        end
      end
    end
  end
end

local import_keywords = {
  import = true,
  from = true,
  as = true,
  const = true,
  let = true,
  var = true,
  require = true,
  use = true,
  include = true,
  export = true,
  type = true,
}

local function import_positions(bufnr)
  local positions = {}
  local seen = {}
  local max_lines = math.min(vim.api.nvim_buf_line_count(bufnr), 200)
  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, max_lines, false)

  for line_idx, line in ipairs(lines) do
    local is_import_line =
      line:match("^%s*import%s+") or
      line:match("^%s*from%s+[%w_%.]+%s+import%s+") or
      line:match("require%s*%(") or
      line:match("^%s*use%s+") or
      line:match("^%s*#%s*include")
    if is_import_line then
      local search_from = 1
      for symbol in line:gmatch("[%a_][%w_]*") do
        local lower = symbol:lower()
        local start_byte = line:find(symbol, search_from, true)
        search_from = (start_byte or search_from) + #symbol
        if not import_keywords[lower] and not seen[symbol] and start_byte then
          seen[symbol] = true
          table.insert(positions, {
            line = line_idx - 1,
            character = util.byte_to_utf16(line, start_byte - 1),
          })
          if #positions >= 5 then
            return positions
          end
        end
      end
    end
  end

  return positions
end

function M.snapshot()
  return {
    recentlyVisitedRanges = vim.deepcopy(M.recent_visits),
    recentlyEditedRanges = vim.deepcopy(M.recent_edits),
  }
end

function M.collect(bufnr, callback)
  local opts = context_options()
  local snap = M.snapshot()
  local result = {
    recentlyVisitedRanges = snap.recentlyVisitedRanges,
    recentlyEditedRanges = snap.recentlyEditedRanges,
    lspSnippets = {},
    importSnippets = {},
    openedFileSnippets = {},
    workspaceConfigSnippets = {},
  }

  if not opts.enabled then
    callback(result)
    return
  end

  local state = {
    seen = {},
    total_chars = 0,
  }

  if opts.include_open_buffers then
    opened_file_snippets(bufnr, result, state, opts)
  end
  if opts.include_workspace_config then
    workspace_config_snippets(result, state, opts)
  end

  if not has_lsp_clients(bufnr) then
    callback(result)
    return
  end

  local done = false
  local pending = 0
  local timer = vim.loop.new_timer()

  local function finish()
    if done then
      return
    end
    if pending > 0 then
      return
    end
    done = true
    if timer then
      timer:stop()
      timer:close()
    end
    callback(result)
  end

  local function finish_one()
    pending = math.max(0, pending - 1)
    finish()
  end

  timer:start(opts.timeout_ms, 0, function()
    vim.schedule(function()
      if done then
        return
      end
      done = true
      callback(result)
      if timer then
        timer:stop()
        timer:close()
      end
    end)
  end)

  local pos = util.cursor_position_utf16(bufnr)
  pending = pending + 1
  request_definition_snippets(bufnr, make_position_params(bufnr, pos.line, pos.character), config.get().max_lsp_snippets, function(snippets)
    if done then
      return
    end
    for _, snippet in ipairs(snippets or {}) do
      add_snippet(result, "lspSnippets", snippet, state, opts)
    end
    finish_one()
  end)

  if opts.include_imports then
    for _, import_pos in ipairs(import_positions(bufnr)) do
      pending = pending + 1
      request_definition_snippets(bufnr, make_position_params(bufnr, import_pos.line, import_pos.character), 1, function(snippets)
        if done then
          return
        end
        for _, snippet in ipairs(snippets or {}) do
          add_snippet(result, "importSnippets", snippet, state, opts)
        end
        finish_one()
      end)
    end
  end

  finish()
end

return M
