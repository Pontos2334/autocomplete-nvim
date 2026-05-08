package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
local rpc = require("autocomplete_nvim.rpc")

T.describe("autocomplete_nvim.rpc", function()
  T.it("starts stopped", function()
    T.assert_false(rpc.is_running())
  end)
end)

T.summary()
T.exit()
