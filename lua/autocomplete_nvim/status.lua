local config = require("autocomplete_nvim.config")

local M = {}

local state = "idle"
local message = ""

local valid = {
  idle = true,
  loading = true,
  disabled = true,
  error = true,
}

local labels = {
  idle = "AI idle",
  loading = "AI loading",
  disabled = "AI off",
  error = "AI error",
}

function M.set_status(next_state, next_message)
  if not valid[next_state] then
    return
  end
  state = next_state
  message = next_message or ""
end

function M.refresh_from_config()
  if config.get().enabled == false then
    M.set_status("disabled")
  elseif state == "disabled" then
    M.set_status("idle")
  end
end

function M.get_status()
  return state
end

function M.get_message()
  return message
end

function M.statusline_component()
  if state == "error" and message ~= "" then
    return labels[state] .. ": " .. message
  end
  return labels[state] or ""
end

function M.loading()
  M.set_status("loading")
end

function M.idle()
  M.set_status("idle")
end

function M.disabled()
  M.set_status("disabled")
end

function M.error(err)
  local msg = ""
  if type(err) == "table" then
    msg = err.message or vim.inspect(err)
  elseif err ~= nil then
    msg = tostring(err)
  end
  M.set_status("error", msg)
end

return M
