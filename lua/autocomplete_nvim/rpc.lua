local config = require("autocomplete_nvim.config")
local util = require("autocomplete_nvim.util")

local M = {}
local state = {
  job_id = nil,
  next_id = 1,
  pending = {},
  initialized = false,
  stdout_buffer = "",
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
      for _, chunk in ipairs(data or {}) do
        state.stdout_buffer = state.stdout_buffer .. chunk
        while true do
          local newline = state.stdout_buffer:find("\n", 1, true)
          if not newline then
            break
          end
          local line = state.stdout_buffer:sub(1, newline - 1)
          state.stdout_buffer = state.stdout_buffer:sub(newline + 1)
          handle_line(line)
        end
      end
    end,
    on_stderr = function(_, data)
      local text = table.concat(data or {}, "\n")
      if text:gsub("%s+", "") ~= "" then
        util.notify(text, vim.log.levels.DEBUG)
      end
    end,
    on_exit = function(_, code)
      state.job_id = nil
      state.initialized = false
      state.stdout_buffer = ""
      for _, pending in pairs(state.pending) do
        pending.reject({ message = "server exited with code " .. tostring(code) })
      end
      state.pending = {}
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
      util.notify("initialize failed: " .. (err.message or vim.inspect(err)), vim.log.levels.WARN)
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
end

return M
