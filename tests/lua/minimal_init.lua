--- Test runner helper for autocomplete.nvim Lua tests.
--- Usage: nvim --headless -l tests/lua/minimal_init.lua

local M = {}
M.passed = 0
M.failed = 0
M.errors = {}

function M.describe(name, fn)
  print(string.format("\n=== %s ===", name))
  fn()
end

function M.it(name, fn)
  local ok, err = pcall(fn)
  if ok then
    M.passed = M.passed + 1
    print(string.format("  PASS: %s", name))
  else
    M.failed = M.failed + 1
    table.insert(M.errors, { name = name, error = err })
    print(string.format("  FAIL: %s - %s", name, tostring(err)))
  end
end

function M.assert_eq(actual, expected, msg)
  if actual ~= expected then
    error(string.format("%s: expected %s, got %s", msg or "assertion", vim.inspect(expected), vim.inspect(actual)))
  end
end

function M.assert_true(val, msg)
  if not val then
    error(string.format("%s: expected truthy, got %s", msg or "assertion", vim.inspect(val)))
  end
end

function M.assert_false(val, msg)
  if val then
    error(string.format("%s: expected falsy, got %s", msg or "assertion", vim.inspect(val)))
  end
end

function M.assert_table_eq(actual, expected, msg)
  if not vim.deep_equal(actual, expected) then
    error(string.format("%s: tables not equal\nactual:   %s\nexpected: %s",
      msg or "assertion", vim.inspect(actual), vim.inspect(expected)))
  end
end

function M.summary()
  print(string.format("\n--- Results: %d passed, %d failed ---", M.passed, M.failed))
  if #M.errors > 0 then
    print("\nFailures:")
    for _, e in ipairs(M.errors) do
      print(string.format("  %s: %s", e.name, e.error))
    end
  end
  return M.failed == 0
end

function M.exit()
  if M.failed > 0 then
    vim.cmd("cq 1")
  else
    vim.cmd("q")
  end
end

return M
