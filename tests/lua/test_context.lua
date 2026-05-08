package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
local context = require("autocomplete_nvim.context")

T.describe("autocomplete_nvim.context", function()
  T.it("snapshot returns recent context tables", function()
    local snap = context.snapshot()
    T.assert_true(type(snap.recentlyVisitedRanges) == "table")
    T.assert_true(type(snap.recentlyEditedRanges) == "table")
  end)
end)

T.summary()
T.exit()
