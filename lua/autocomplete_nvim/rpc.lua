local config = require("autocomplete_nvim.config")
local util = require("autocomplete_nvim.util")

local M = {}
local state = {
  job_id = nil,
  next_id = 1,
  pending = {},
  initialized = false,
  stdout_buffer = "",
  stderr_buffer = "",
}

local function send_raw(payload)
  if not state.job_id then
    return false
  end
  local line = vim.json.encode(payload)
  vim.fn.chansend(state.job_id, line .. "\n")
  return true
end

local function handle_line(line)
  if not line or line == "" then
    return
  end
  local ok, message = pcall(vim.json.decode, line)
  if not ok or type(message) ~= "table" then
    return
  end
  local pending = state.pending[message.id]
  if not pending then
    return
  end
  state.pending[message.id] = nil
  if pending.timer then
    pending.timer:stop()
    pending.timer:close()
  end
  if message.error then
    pending.reject(message.error)
  else
    pending.resolve(message.result)
  end
end

--- Process a channel-lines data array from on_stdout/on_stderr.
--- Neovim channel-lines semantics: data is a list of strings where
--- the first element continues the previous partial line, and each
--- subsequent element is a new complete line. The last element may be
--- a partial line continued in the next callback. An empty string ""
--- signals end-of-stream or line termination.
---@param buf string  existing partial line buffer
---@param data string[]  lines from on_stdout/on_stderr
---@param handler fun(line: string)  called for each complete line
---@return string  new partial line buffer
local function process_channel_lines(buf, data, handler)
  if not data or #data == 0 then
    return buf
  end
  buf = buf .. data[1]
  for i = 2, #data do
    handler(buf)
    buf = data[i]
  end
  return buf
end

function M.is_running()
  return state.job_id ~= nil
end

function M.start()
  if state.job_id then
    return true
  end
  local opts = config.get()
  if vim.fn.filereadable(opts.server_path) == 0 then
    util.notify("Server not built: " .. opts.server_path .. ". Run npm install && npm run build in server/.", vim.log.levels.WARN)
    return false
  end
  state.job_id = vim.fn.jobstart({ opts.node_command, opts.server_path }, {
    stdout_buffered = false,
    stderr_buffered = false,
    on_stdout = function(_, data)
      state.stdout_buffer = process_channel_lines(state.stdout_buffer, data, handle_line)
    end,
    on_stderr = function(_, data)
      state.stderr_buffer = process_channel_lines(state.stderr_buffer, data, function(line)
        if line and line:match("%S") then
          util.notify(line, vim.log.levels.DEBUG)
        end
      end)
    end,
    on_exit = function(_, code)
      local was_running = state.job_id ~= nil
      state.job_id = nil
      state.initialized = false
      state.stdout_buffer = ""
      state.stderr_buffer = ""
      for _, pending in pairs(state.pending) do
        pending.reject({ message = "server exited with code " .. tostring(code) })
      end
      state.pending = {}
      if was_running and code ~= 0 then
        util.notify("Autocomplete server exited unexpectedly (code " .. code .. "). It will restart on next trigger.", vim.log.levels.WARN)
      end
    end,
  })
  if state.job_id <= 0 then
    state.job_id = nil
    util.notify("Failed to start autocomplete server", vim.log.levels.ERROR)
    return false
  end
  return true
end

function M.request(method, params, timeout_ms)
  if not M.start() then
    return nil, { message = "server not running" }
  end
  if not state.initialized and method ~= "initialize" then
    local init_result, init_err = M.request("initialize", { configPath = config.get().config_path }, 10000)
    if init_err then
      return nil, init_err
    end
    state.initialized = true
  end
  local id = state.next_id
  state.next_id = state.next_id + 1
  local co = coroutine.running()
  if not co then
    error("rpc.request must be called from a coroutine")
  end
  local timer = vim.loop.new_timer()
  state.pending[id] = {
    resolve = function(result)
      coroutine.resume(co, result, nil)
    end,
    reject = function(err)
      coroutine.resume(co, nil, err)
    end,
    timer = timer,
  }
  timer:start(timeout_ms or 30000, 0, function()
    local pending = state.pending[id]
    if pending then
      state.pending[id] = nil
      pending.reject({ message = "request timed out" })
    end
  end)
  send_raw({ jsonrpc = "2.0", id = id, method = method, params = params or {} })
  return coroutine.yield()
end

function M.initialize()
  coroutine.wrap(function()
    local opts = config.get()
    local result, err = M.request("initialize", { configPath = opts.config_path }, 10000)
    if err then
      util.notify(
        "initialize failed: " .. (err.message or vim.inspect(err))
          .. " (node=" .. opts.node_command .. " server=" .. opts.server_path .. ")",
        vim.log.levels.WARN
      )
      return
    end
    state.initialized = true
    return result
  end)()
end

function M.request_async(method, params, callback, timeout_ms)
  coroutine.wrap(function()
    local result, err = M.request(method, params, timeout_ms)
    vim.schedule(function()
      callback(result, err)
    end)
  end)()
end

function M.stop()
  if state.job_id then
    pcall(send_raw, { jsonrpc = "2.0", id = state.next_id, method = "shutdown", params = {} })
    vim.fn.jobstop(state.job_id)
    state.job_id = nil
  end
  state.stdout_buffer = ""
  state.stderr_buffer = ""
end

return M
