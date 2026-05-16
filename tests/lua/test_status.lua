package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
local config = require("autocomplete_nvim.config")
local status = require("autocomplete_nvim.status")

T.describe("autocomplete_nvim.status", function()
  T.it("defaults to idle", function()
    status.idle()
    T.assert_eq(status.get_status(), "idle")
    T.assert_eq(status.get_message(), "")
  end)

  T.it("tracks loading state", function()
    status.loading()
    T.assert_eq(status.get_status(), "loading")
    T.assert_true(status.statusline_component():match("loading") ~= nil)
  end)

  T.it("tracks error message", function()
    status.error({ message = "boom" })
    T.assert_eq(status.get_status(), "error")
    T.assert_eq(status.get_message(), "boom")
    T.assert_true(status.statusline_component():match("boom") ~= nil)
  end)

  T.it("refreshes disabled state from config", function()
    config.setup({ enabled = false, notify = false })
    status.refresh_from_config()
    T.assert_eq(status.get_status(), "disabled")

    config.setup({ enabled = true, notify = false })
    status.refresh_from_config()
    T.assert_eq(status.get_status(), "idle")
  end)
end)

T.summary()
T.exit()
