package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
local config = require("autocomplete_nvim.config")
local context = require("autocomplete_nvim.context")

config.setup({
  notify = false,
  context = {
    enabled = true,
    include_imports = true,
    include_open_buffers = true,
    include_workspace_config = true,
    timeout_ms = 10,
    max_snippets = 8,
    max_snippet_chars = 200,
    max_total_chars = 1000,
  },
})

T.describe("autocomplete_nvim.context", function()
  T.it("snapshot returns recent context tables", function()
    local snap = context.snapshot()
    T.assert_true(type(snap.recentlyVisitedRanges) == "table")
    T.assert_true(type(snap.recentlyEditedRanges) == "table")
  end)

  T.it("collect returns unified context shape without LSP", function()
    local bufnr = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_set_current_buf(bufnr)
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { "const x = 1;" })

    local got
    context.collect(bufnr, function(result)
      got = result
    end)

    T.assert_true(type(got) == "table")
    T.assert_true(type(got.lspSnippets) == "table")
    T.assert_true(type(got.importSnippets) == "table")
    T.assert_true(type(got.openedFileSnippets) == "table")
    T.assert_true(type(got.workspaceConfigSnippets) == "table")

    vim.api.nvim_buf_delete(bufnr, { force = true })
  end)

  T.it("collect includes open buffers and workspace config snippets", function()
    local old_cwd = vim.loop.cwd()
    local tmp = vim.fn.tempname()
    vim.fn.mkdir(tmp, "p")
    vim.fn.writefile({ '{"type":"module"}' }, tmp .. "/package.json")
    vim.fn.chdir(tmp)

    local current = vim.api.nvim_create_buf(false, false)
    vim.api.nvim_buf_set_name(current, tmp .. "/app.ts")
    vim.api.nvim_buf_set_lines(current, 0, -1, false, { "import { value } from './lib'", "value" })
    vim.api.nvim_set_current_buf(current)

    local other = vim.api.nvim_create_buf(false, false)
    vim.api.nvim_buf_set_name(other, tmp .. "/lib.ts")
    vim.api.nvim_buf_set_lines(other, 0, -1, false, { "export const value = 1;" })

    local got
    context.collect(current, function(result)
      got = result
    end)

    T.assert_true(#got.openedFileSnippets >= 1)
    T.assert_true(#got.workspaceConfigSnippets >= 1)

    vim.api.nvim_buf_delete(other, { force = true })
    vim.api.nvim_buf_delete(current, { force = true })
    if old_cwd then
      vim.fn.chdir(old_cwd)
    end
  end)
end)

T.summary()
T.exit()
