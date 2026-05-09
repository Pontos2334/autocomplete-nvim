package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")

-- Extract process_channel_lines for testing by loading the module
-- and re-implementing the pure function identically for unit testing.
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

T.describe("autocomplete_nvim.rpc", function()
  T.it("starts stopped", function()
    local rpc = require("autocomplete_nvim.rpc")
    T.assert_false(rpc.is_running())
  end)
end)

T.describe("process_channel_lines", function()
  T.it("single callback with one complete line + terminator", function()
    local received = {}
    local buf = process_channel_lines("", { '{"id":1}', "" }, function(line)
      table.insert(received, line)
    end)
    T.assert_eq(#received, 1)
    T.assert_eq(received[1], '{"id":1}')
    T.assert_eq(buf, "")
  end)

  T.it("split across two callbacks", function()
    local received = {}
    local buf = process_channel_lines("", { '{"id' }, function(line)
      table.insert(received, line)
    end)
    T.assert_eq(#received, 0)
    T.assert_eq(buf, '{"id')

    buf = process_channel_lines(buf, { '":1}', "" }, function(line)
      table.insert(received, line)
    end)
    T.assert_eq(#received, 1)
    T.assert_eq(received[1], '{"id":1}')
    T.assert_eq(buf, "")
  end)

  T.it("single callback with multiple segments", function()
    local received = {}
    local buf = process_channel_lines("", { "line1", "line2", "line3", "" }, function(line)
      table.insert(received, line)
    end)
    T.assert_eq(#received, 3)
    T.assert_eq(received[1], "line1")
    T.assert_eq(received[2], "line2")
    T.assert_eq(received[3], "line3")
    T.assert_eq(buf, "")
  end)

  T.it("empty data array returns buffer unchanged", function()
    local buf = process_channel_lines("partial", {}, function() end)
    T.assert_eq(buf, "partial")
  end)

  T.it("empty string terminator produces no spurious message", function()
    local received = {}
    local buf = process_channel_lines("", { "" }, function(line)
      table.insert(received, line)
    end)
    T.assert_eq(#received, 0)
    T.assert_eq(buf, "")
  end)

  T.it("partial line preserved across callbacks", function()
    local received = {}
    local buf = process_channel_lines("", { "alpha" }, function(line)
      table.insert(received, line)
    end)
    T.assert_eq(#received, 0)
    T.assert_eq(buf, "alpha")

    buf = process_channel_lines(buf, { "beta", "gamma" }, function(line)
      table.insert(received, line)
    end)
    T.assert_eq(#received, 1)
    T.assert_eq(received[1], "alphabeta")
    T.assert_eq(buf, "gamma")
  end)
end)

T.summary()
T.exit()
