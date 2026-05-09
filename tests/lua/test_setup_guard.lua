--- Test: setup() repeat-call protection
local test = require("tests.lua.minimal_init")

test.describe("setup guard", function()
  test.it("setup does not error on first call", function()
    local ok, err = pcall(function()
      require("autocomplete_nvim").setup({})
    end)
    test.assert_true(ok, "first setup should succeed, got: " .. tostring(err))
  end)

  test.it("setup does not error on second call", function()
    local ok, err = pcall(function()
      require("autocomplete_nvim").setup({})
    end)
    test.assert_true(ok, "second setup should succeed, got: " .. tostring(err))
  end)

  test.it("setup does not error on third call with different opts", function()
    local ok, err = pcall(function()
      require("autocomplete_nvim").setup({
        debounce_delay = 500,
        keymaps = {
          accept = "<Tab>",
          dismiss = "<C-e>",
        },
      })
    end)
    test.assert_true(ok, "third setup with opts should succeed, got: " .. tostring(err))
  end)

  test.it("stop function exists", function()
    local M = require("autocomplete_nvim")
    test.assert_true(type(M.stop) == "function", "stop should be a function")
  end)

  test.it("stop does not error", function()
    local ok, err = pcall(function()
      require("autocomplete_nvim").stop()
    end)
    test.assert_true(ok, "stop should succeed, got: " .. tostring(err))
  end)
end)

test.summary()
test.exit()
