package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
local util = require("autocomplete_nvim.util")

T.describe("autocomplete_nvim.util utf conversion", function()
  T.it("round trips ascii", function()
    local line = "hello"
    for byte = 0, #line do
      local utf16 = util.byte_to_utf16(line, byte)
      T.assert_eq(util.utf16_to_byte(line, utf16), byte)
    end
  end)

  T.it("round trips CJK and emoji at boundaries", function()
    local line = "a中😀z"
    local byte = string.find(line, "z") - 1
    local utf16 = util.byte_to_utf16(line, byte)
    T.assert_eq(util.utf16_to_byte(line, utf16), byte)
  end)
end)

T.summary()
T.exit()
