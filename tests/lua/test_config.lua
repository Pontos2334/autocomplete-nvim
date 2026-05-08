package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
local config = require("autocomplete_nvim.config")

T.describe("autocomplete_nvim.config", function()
  T.it("merges user options over defaults", function()
    local cfg = config.setup({ debounce_delay = 123, notify = false })
    T.assert_eq(cfg.debounce_delay, 123)
    T.assert_eq(cfg.enabled, true)
  end)

  T.it("deep merges nested keymaps", function()
    local cfg = config.setup({ keymaps = { accept = "<C-y>" }, notify = false })
    T.assert_eq(cfg.keymaps.accept, "<C-y>")
    T.assert_eq(cfg.keymaps.trigger, "<C-M-Space>")
  end)
end)

T.summary()
T.exit()
