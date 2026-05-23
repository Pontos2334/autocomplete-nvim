package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

local T = require("tests.lua.minimal_init")
local util = require("autocomplete_nvim.util")

T.describe("util.matches_glob", function()
  -- *.ext patterns
  T.it("matches *.md for markdown files", function()
    T.assert_true(util.matches_glob("/tmp/project/README.md", "*.md"))
    T.assert_true(util.matches_glob("notes.md", "*.md"))
    T.assert_false(util.matches_glob("/tmp/project/main.ts", "*.md"))
  end)

  T.it("matches *.ts for TypeScript files", function()
    T.assert_true(util.matches_glob("/project/src/index.ts", "*.ts"))
    T.assert_false(util.matches_glob("/project/src/index.tsx", "*.ts"))
  end)

  -- ** directory patterns
  T.it("matches node_modules/** for any path under node_modules", function()
    T.assert_true(util.matches_glob("/project/node_modules/foo/bar.js", "node_modules/**"))
    T.assert_true(util.matches_glob("/project/node_modules/package", "node_modules/**"))
    T.assert_false(util.matches_glob("/project/src/node_modules_backup/x", "node_modules/**"))
  end)

  T.it("matches dist/** for build output directories", function()
    T.assert_true(util.matches_glob("/project/dist/index.js", "dist/**"))
    T.assert_true(util.matches_glob("/project/dist/sub/deep/file.js", "dist/**"))
    T.assert_false(util.matches_glob("/project/src/dist.js", "dist/**"))
  end)

  -- exact suffix path
  T.it("matches exact path suffix", function()
    T.assert_true(util.matches_glob("/tmp/project/test.js", "test.js"))
    T.assert_true(util.matches_glob("/tmp/project/src/test.js", "test.js"))
    T.assert_false(util.matches_glob("/tmp/project/test.jsx", "test.js"))
  end)

  -- edge cases
  T.it("does not match empty pattern against non-empty path", function()
    T.assert_false(util.matches_glob("/some/file.ts", ""))
  end)

  T.it("matches path with dots in directory names", function()
    T.assert_true(util.matches_glob("/tmp/user.cool/project/file.md", "*.md"))
  end)

  T.it("handles pattern with special regex chars", function()
    T.assert_true(util.matches_glob("/project/file-test.ts", "file-test.ts"))
    T.assert_true(util.matches_glob("/project/init.lua", "init.lua"))
  end)
end)

T.summary()
T.exit()
