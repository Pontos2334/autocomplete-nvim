import { getLastNUriRelativePathParts } from "../../util/uri";
import {
  AutocompleteClipboardSnippet,
  AutocompleteCodeSnippet,
  AutocompleteDiffSnippet,
  AutocompleteSnippet,
  AutocompleteSnippetType,
  AutocompleteStaticSnippet,
} from "../snippets/types";
import { HelperVars } from "../util/HelperVars";

const CONFIG_FILES = [
  "package.json", "tsconfig.json", "jsconfig.json",
  ".eslintrc", ".prettierrc", ".babelrc",
  "vite.config", "webpack.config", "rollup.config",
  "jest.config", "vitest.config", "tsup.config",
  "docker-compose", "Dockerfile",
];

export function describeFile(filepath: string): string {
  const parts = filepath.replace(/\\/g, "/").split("/");
  const filename = parts[parts.length - 1] || "";
  const filenameLower = filename.toLowerCase();

  for (const cfg of CONFIG_FILES) {
    if (filenameLower.startsWith(cfg.toLowerCase())) return "项目配置文件";
  }
  if (filenameLower === ".env" || filenameLower.startsWith(".env.")) return "环境变量配置";
  if (filenameLower.endsWith(".config.js") || filenameLower.endsWith(".config.ts") ||
      filenameLower.endsWith(".config.mjs") || filenameLower.endsWith(".config.cjs")) return "构建配置文件";

  const dir = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : "";
  if (dir === "routes" || dir === "pages" || dir === "api") return "路由文件";
  if (dir === "controllers") return "控制器";
  if (dir === "models" || dir === "entities" || dir === "schemas") return "数据模型";
  if (dir === "services") return "业务逻辑";
  if (dir === "middleware") return "中间件";
  if (dir === "utils" || dir === "helpers" || dir === "lib") return "工具函数";
  if (dir === "views" || dir === "templates") return "视图模板";
  if (dir === "components") return "组件";
  if (dir === "types" || dir === "interfaces") return "类型定义";
  if (dir === "__tests__" || dir === "tests" || dir === "test" ||
      filenameLower.includes(".test.") || filenameLower.includes(".spec.")) return "测试文件";
  if (dir === "migrations" || dir === "seeds") return "数据库迁移";
  if (dir === "public" || dir === "static" || dir === "assets") return "静态资源";

  return "相关文件";
}

const formatClipboardSnippet = (
  snippet: AutocompleteClipboardSnippet,
  workspaceDirs: string[],
): AutocompleteCodeSnippet => {
  return formatCodeSnippet(
    {
      filepath: "file:///Untitled.txt",
      content: `[剪贴板内容]\n${snippet.content}`,
      type: AutocompleteSnippetType.Code,
    },
    workspaceDirs,
  );
};

const formatCodeSnippet = (
  snippet: AutocompleteCodeSnippet,
  workspaceDirs: string[],
): AutocompleteCodeSnippet => {
  const relPath = getLastNUriRelativePathParts(workspaceDirs, snippet.filepath, 2);
  const desc = describeFile(snippet.filepath);
  return {
    ...snippet,
    content: `--- [${desc}: ${relPath}] ---\n${snippet.content}`,
  };
};

const formatDiffSnippet = (
  snippet: AutocompleteDiffSnippet,
): AutocompleteDiffSnippet => {
  return {
    ...snippet,
    content: `--- [Git 未暂存变更] ---\n${snippet.content}`,
  };
};

const formatStaticSnippet = (
  snippet: AutocompleteStaticSnippet,
): AutocompleteStaticSnippet => {
  return snippet;
};

export const formatSnippets = (
  _helper: HelperVars,
  snippets: AutocompleteSnippet[],
  workspaceDirs: string[],
): string => {
  const currentFilePath = getLastNUriRelativePathParts(workspaceDirs, _helper.filepath, 2);
  const divider = `--- 以下是当前编辑文件 (${currentFilePath}) ---`;

  return (
    snippets
      .map((snippet) => {
        switch (snippet.type) {
          case AutocompleteSnippetType.Code:
            return formatCodeSnippet(snippet, workspaceDirs);
          case AutocompleteSnippetType.Diff:
            return formatDiffSnippet(snippet);
          case AutocompleteSnippetType.Clipboard:
            return formatClipboardSnippet(snippet, workspaceDirs);
          case AutocompleteSnippetType.Static:
            return formatStaticSnippet(snippet);
          default:
            return undefined;
        }
      })
      .filter((item): item is AutocompleteSnippet => item != null)
      .map((item) => item.content)
      .join("\n\n") + `\n${divider}`
  );
};
