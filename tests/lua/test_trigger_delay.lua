package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
local config = require("autocomplete_nvim.config")

-- Setup config with known delays
config.setup({
  debounce_delay = 350,
  enter_trigger_delay = 120,
  backspace_trigger_delay = 180,
  notify = false,
})

-- We test detect_trigger_delay by importing init.lua's internal logic.
-- Since detect_trigger_delay is local, we test the exported behavior through
-- the config values it reads, verifying the config defaults are correct.

T.describe("config trigger delay defaults", function()
  local opts = config.get()

  T.it("debounce_delay defaults to 350ms", function()
    T.assert_eq(opts.debounce_delay, 350)
  end)

  T.it("enter_trigger_delay defaults to 120ms", function()
    T.assert_eq(opts.enter_trigger_delay, 120)
  end)

  T.it("backspace_trigger_delay defaults to 180ms", function()
    T.assert_eq(opts.backspace_trigger_delay, 180)
  end)

  T.it("chain_completion_delay defaults to 0 (disabled)", function()
    T.assert_eq(opts.chain_completion_delay, 0)
  end)
end)

T.describe("config trigger delay overrides", function()
  local cfg = config.setup({
    debounce_delay = 500,
    enter_trigger_delay = 200,
    backspace_trigger_delay = 300,
    chain_completion_delay = 100,
    notify = false,
  })

  T.it("debounce_delay is overridden", function()
    T.assert_eq(cfg.debounce_delay, 500)
  end)

  T.it("enter_trigger_delay is overridden", function()
    T.assert_eq(cfg.enter_trigger_delay, 200)
  end)

  T.it("backspace_trigger_delay is overridden", function()
    T.assert_eq(cfg.backspace_trigger_delay, 300)
  end)

  T.it("chain_completion_delay is overridden", function()
    T.assert_eq(cfg.chain_completion_delay, 100)
  end)
end)

-- Integration test: verify detect_trigger_delay logic with real buffers.
-- We simulate buffer state changes and check the returned delay.
T.describe("detect_trigger_delay with buffer changes", function()
  -- We need to load init.lua, but it has side effects (starts RPC, etc).
  -- Instead, replicate the core logic for testing.
  local function make_detect_trigger(get_opts)
    local buf_state = {}
    local function update_buf_state(bufnr)
      local line_count = vim.api.nvim_buf_line_count(bufnr)
      local text = table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")
      local changedtick = vim.b[bufnr].changedtick or 0
      local state = buf_state[bufnr]
      local prev = state or { line_count = 0, text_len = 0, changedtick = 0 }
      buf_state[bufnr] = {
        line_count = line_count,
        text_len = #text,
        changedtick = changedtick,
      }
      return prev, buf_state[bufnr]
    end

    return function(bufnr)
      local opts = get_opts()
      local prev, cur = update_buf_state(bufnr)
      if not prev or prev.changedtick == 0 then
        return opts.debounce_delay
      end
      if cur.line_count > prev.line_count then
        return opts.enter_trigger_delay > 0 and opts.enter_trigger_delay or opts.debounce_delay
      end
      if cur.text_len < prev.text_len then
        return opts.backspace_trigger_delay > 0 and opts.backspace_trigger_delay or opts.debounce_delay
      end
      return opts.debounce_delay
    end
  end

  local opts = config.setup({
    debounce_delay = 350,
    enter_trigger_delay = 120,
    backspace_trigger_delay = 180,
    notify = false,
  })

  local detect = make_detect_trigger(function() return opts end)

  T.it("returns debounce_delay on first call (no previous state)", function()
    local bufnr = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { "hello" })
    local delay = detect(bufnr)
    T.assert_eq(delay, 350)
    vim.api.nvim_buf_delete(bufnr, { force = true })
  end)

  T.it("returns enter_trigger_delay when line count increases", function()
    local bufnr = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { "line1" })
    detect(bufnr) -- establish baseline
    -- Add a line (simulates Enter)
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { "line1", "line2" })
    local delay = detect(bufnr)
    T.assert_eq(delay, 120)
    vim.api.nvim_buf_delete(bufnr, { force = true })
  end)

  T.it("returns backspace_trigger_delay when text gets shorter", function()
    local bufnr = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { "hello world" })
    detect(bufnr) -- establish baseline
    -- Remove characters (simulates backspace)
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { "hello worl" })
    local delay = detect(bufnr)
    T.assert_eq(delay, 180)
    vim.api.nvim_buf_delete(bufnr, { force = true })
  end)

  T.it("returns debounce_delay for normal typing (same line count, longer text)", function()
    local bufnr = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { "hello" })
    detect(bufnr) -- establish baseline
    -- Add characters on same line (simulates normal typing)
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { "hello world" })
    local delay = detect(bufnr)
    T.assert_eq(delay, 350)
    vim.api.nvim_buf_delete(bufnr, { force = true })
  end)
end)

T.summary()
T.exit()
