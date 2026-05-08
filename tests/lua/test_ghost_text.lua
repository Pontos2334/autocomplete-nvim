package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
require("autocomplete_nvim.config").setup({ notify = false })
local ghost = require("autocomplete_nvim.ghost")

T.describe("autocomplete_nvim.ghost", function()
  T.it("accept inserts completion text", function()
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "const a = " })
    ghost.show(buf, {
      completionId = "1",
      completion = "1",
      range = {
        start = { line = 0, character = 10 },
        ["end"] = { line = 0, character = 10 },
      },
    })
    local ok = ghost.accept()
    T.assert_true(ok)
    T.assert_eq(vim.api.nvim_buf_get_lines(buf, 0, 1, false)[1], "const a = 1")
    vim.api.nvim_buf_delete(buf, { force = true })
  end)

  T.it("clear is safe without active item", function()
    ghost.clear()
    ghost.clear()
    T.assert_true(true)
  end)
end)

T.summary()
T.exit()
