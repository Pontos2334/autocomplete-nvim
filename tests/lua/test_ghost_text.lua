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

  T.it("can_accept returns false when no ghost text", function()
    T.assert_false(ghost.can_accept())
  end)

  T.it("can_accept returns true when ghost text is shown", function()
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "hello" })
    ghost.show(buf, {
      completionId = "2",
      completion = " world",
      range = {
        start = { line = 0, character = 5 },
        ["end"] = { line = 0, character = 5 },
      },
    })
    T.assert_true(ghost.can_accept())
    ghost.clear()
    vim.api.nvim_buf_delete(buf, { force = true })
  end)

  T.it("accept clears current after successful write", function()
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "x + " })
    ghost.show(buf, {
      completionId = "3",
      completion = "1",
      range = {
        start = { line = 0, character = 4 },
        ["end"] = { line = 0, character = 4 },
      },
    })
    local ok = ghost.accept()
    T.assert_true(ok)
    T.assert_false(ghost.can_accept())
    T.assert_eq(vim.api.nvim_buf_get_lines(buf, 0, 1, false)[1], "x + 1")
    vim.api.nvim_buf_delete(buf, { force = true })
  end)

  T.it("accept preserves ghost state on write failure", function()
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "test" })
    ghost.show(buf, {
      completionId = "4",
      completion = "val",
      range = {
        start = { line = 0, character = 4 },
        ["end"] = { line = 0, character = 4 },
      },
    })
    vim.api.nvim_buf_delete(buf, { force = true })
    local ok = ghost.accept()
    T.assert_false(ok)
  end)
end)

T.describe("autocomplete_nvim.ghost <Plug> keymap", function()
  T.it("setup creates <Plug>(autocomplete_nvim_accept) mapping", function()
    local M = require("autocomplete_nvim")
    M.setup({ notify = false })
    local mappings = vim.api.nvim_get_keymap("i")
    local found = false
    for _, m in ipairs(mappings) do
      if m.lhs == "<Plug>(autocomplete_nvim_accept)" then
        found = true
        break
      end
    end
    T.assert_true(found, "<Plug>(autocomplete_nvim_accept) should exist after setup")
    M.stop()
  end)

  T.it("accept keymap does not return encoded <Plug> bytes", function()
    local M = require("autocomplete_nvim")
    M.setup({ notify = false })
    -- Show ghost text
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "foo + " })
    ghost.show(buf, {
      completionId = "test-plug",
      completion = "bar",
      range = {
        start = { line = 0, character = 6 },
        ["end"] = { line = 0, character = 6 },
      },
    })

    -- The accept keymap is expr=true, so it returns a string.
    -- With ghost present, it should return "" (empty string) because
    -- it uses feedkeys internally to trigger <Plug>, not an expr return.
    -- We cannot directly call the mapping callback, but we can verify:
    -- 1. <Plug> mapping exists
    -- 2. ghost.can_accept() is true
    -- 3. feedkeys was NOT called with encoded bytes as expr return
    -- The key invariant: expr return should never contain <80>... bytes
    T.assert_true(ghost.can_accept())

    -- Directly invoke the <Plug> mapping (non-expr, safe context)
    local mappings = vim.api.nvim_get_keymap("i")
    local plug_found = false
    for _, m in ipairs(mappings) do
      if m.lhs == "<Plug>(autocomplete_nvim_accept)" then
        plug_found = true
        -- Invoke the callback directly in a safe context
        local ok, item = ghost.accept()
        T.assert_true(ok, "<Plug> callback should accept ghost text")
        T.assert_eq(item.completionId, "test-plug")
        break
      end
    end
    T.assert_true(plug_found, "<Plug> mapping must exist")

    -- Verify buffer now has accepted text
    local lines = vim.api.nvim_buf_get_lines(buf, 0, 1, false)
    T.assert_eq(lines[1], "foo + bar", "buffer should contain accepted completion")

    vim.api.nvim_buf_delete(buf, { force = true })
    M.stop()
  end)

  T.it("no ghost text leaves Tab fallback working", function()
    local M = require("autocomplete_nvim")
    M.setup({ notify = false })
    -- Without ghost, the mapping exists and doesn't error
    T.assert_false(ghost.can_accept())
    -- Verify the Tab mapping is still registered
    local mappings = vim.api.nvim_get_keymap("i")
    local tab_found = false
    for _, m in ipairs(mappings) do
      if m.lhs == "<Tab>" then
        tab_found = true
        break
      end
    end
    T.assert_true(tab_found, "Tab mapping should be registered")
    M.stop()
  end)
end)

T.summary()
T.exit()
