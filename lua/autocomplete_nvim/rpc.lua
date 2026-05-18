local config = require("autocomplete_nvim.config")
local util = require("autocomplete_nvim.util")

local M = {}
local state = {
  job_id = nil,
  next_id = 1,
  pending = {},
  initialized_session_id = nil,
  session_id = 0,
  closing_sessions = {},
}

local function send_raw(payload)
  if not state.job_id then
    return false
  end
  local line = vim.json.encode(payload)
  vim.fn.chansend(state.job_id, line .. "\n")
  return true
end

local function close_timer(timer)
  if not timer then
    return
  end
  pcall(function()
    timer:stop()
    timer:close()
  end)
end

local function cancel_pending_timers(session_id)
  for _, pending in pairs(state.pending) do
    if pending.session_id == session_id then
      close_timer(pending.timer)
      pending.timer = nil
    end
  end
end

local function reject_pending_for_session(session_id, err)
  for id, pending in pairs(state.pending) do
    if pending.session_id == session_id then
      close_timer(pending.timer)
      pending.timer = nil
      state.pending[id] = nil
      pending.reject(err)
    end
  end
end

local function handle_line(session_id, line)
  if not line or line == "" then
    return
  end
  local ok, message = pcall(vim.json.decode, line)
  if not ok or type(message) ~= "table" then
    return
  end
  local pending = state.pending[message.id]
  if not pending or pending.session_id ~= session_id then
    return
  end
  state.pending[message.id] = nil
  close_timer(pending.timer)
  pending.timer = nil
  if message.error then
    pending.reject(message.error)
  else
    local result = message.result
    if result == vim.NIL then
      result = nil
    end
    pending.resolve(result)
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
  state.session_id = state.session_id + 1
  local session_id = state.session_id
  local stdout_buffer = ""
  local stderr_buffer = ""
  state.job_id = vim.fn.jobstart({ opts.node_command, opts.server_path }, {
    stdout_buffered = false,
    stderr_buffered = false,
    on_stdout = function(_, data)
      stdout_buffer = process_channel_lines(stdout_buffer, data, function(line)
        handle_line(session_id, line)
      end)
    end,
    on_stderr = function(_, data)
      stderr_buffer = process_channel_lines(stderr_buffer, data, function(line)
        if line and line:match("%S") then
          util.notify(line, vim.log.levels.DEBUG)
        end
      end)
    end,
    on_exit = function(job_id, code)
      local is_current_job = state.job_id == job_id
      if is_current_job then
        state.job_id = nil
        state.initialized_session_id = nil
      end
      reject_pending_for_session(session_id, { message = "server exited with code " .. tostring(code) })
      if is_current_job and not state.closing_sessions[session_id] and code ~= 0 then
        util.notify("Autocomplete server exited unexpectedly (code " .. code .. "). It will restart on next trigger.", vim.log.levels.WARN)
      end
    end,
  })
  if state.job_id <= 0 then
    state.job_id = nil
    state.closing_sessions[session_id] = nil
    util.notify("Failed to start autocomplete server", vim.log.levels.ERROR)
    return false
  end
  return true
end

function M.request(method, params, timeout_ms)
  if not M.start() then
    return nil, { message = "server not running" }
  end
  if state.initialized_session_id ~= state.session_id and method ~= "initialize" then
    local init_result, init_err = M.request("initialize", { configPath = config.get().config_path }, 10000)
    if init_err then
      return nil, init_err
    end
    if state.closing_sessions[state.session_id] then
      return nil, { message = "server shutting down" }, state.session_id
    end
    state.initialized_session_id = state.session_id
  end
  local id = state.next_id
  state.next_id = state.next_id + 1
  local co = coroutine.running()
  if not co then
    error("rpc.request must be called from a coroutine")
  end
  local session_id = state.session_id
  local timer = vim.loop.new_timer()
  state.pending[id] = {
    session_id = session_id,
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
      close_timer(pending.timer)
      pending.timer = nil
      pending.reject({ message = "request timed out" })
    end
  end)
  send_raw({ jsonrpc = "2.0", id = id, method = method, params = params or {} })
  local result, err = coroutine.yield()
  return result, err, session_id
end

function M.initialize()
  if state.initialized_session_id == state.session_id and state.job_id then
    return
  end
  coroutine.wrap(function()
    local opts = config.get()
    local result, err, session_id = M.request("initialize", { configPath = opts.config_path }, 10000)
    if err then
      if session_id and state.closing_sessions[session_id] then
        return
      end
      util.notify(
        "initialize failed: " .. (err.message or vim.inspect(err))
          .. " (node=" .. opts.node_command .. " server=" .. opts.server_path .. ")",
        vim.log.levels.WARN
      )
      return
    end
    if session_id and state.closing_sessions[session_id] then
      return
    end
    state.initialized_session_id = session_id or state.session_id
    return result
  end)()
end

function M.request_async(method, params, callback, timeout_ms)
  coroutine.wrap(function()
    local result, err, session_id = M.request(method, params, timeout_ms)
    vim.schedule(function()
      if session_id and state.closing_sessions[session_id] then
        return
      end
      callback(result, err)
    end)
  end)()
end

function M.stop()
  if state.job_id then
    local job_id = state.job_id
    local session_id = state.session_id
    if not state.closing_sessions[session_id] then
      state.closing_sessions[session_id] = true
      cancel_pending_timers(session_id)
      local shutdown_id = state.next_id
      state.next_id = state.next_id + 1
      pcall(send_raw, { jsonrpc = "2.0", id = shutdown_id, method = "shutdown", params = {} })
    end
    pcall(vim.fn.chanclose, job_id, "stdin")
    state.job_id = nil
  end
  state.initialized_session_id = nil
end

return M
