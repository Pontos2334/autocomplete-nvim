// Stub for tree-sitter functionality
// In standalone mode, we skip AST-based context features

import { getUriFileExtension } from "./uri";

export enum LanguageName {
  CPP = "cpp",
  C_SHARP = "c_sharp",
  C = "c",
  CSS = "css",
  PHP = "php",
  BASH = "bash",
  JSON = "json",
  TYPESCRIPT = "typescript",
  TSX = "tsx",
  ELM = "elm",
  JAVASCRIPT = "javascript",
  PYTHON = "python",
  RUST = "rust",
  GO = "go",
  JAVA = "java",
  RUBY = "ruby",
  SWIFT = "swift",
  KOTLIN = "kotlin",
  HTML = "html",
  DJANGO_HTML = "django-html",
  LUA = "lua",
  OCAML = "ocaml",
  ELIXIR = "elixir",
  GLSL = "glsl",
  SCALA = "scala",
  ERB = "erb",
  HASKELL = "haskell",
  SQL = "sql",
  C_SHARP_ABSTRACT = "c_sharp_abstract",
  MARKDOWN = "markdown",
  EJS = "ejs",
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: LanguageName.TYPESCRIPT,
  tsx: LanguageName.TSX,
  js: LanguageName.JAVASCRIPT,
  jsx: LanguageName.JAVASCRIPT,
  py: LanguageName.PYTHON,
  rs: LanguageName.RUST,
  go: LanguageName.GO,
  java: LanguageName.JAVA,
  rb: LanguageName.RUBY,
  cs: LanguageName.C_SHARP,
  cpp: LanguageName.CPP,
  c: LanguageName.C,
  php: LanguageName.PHP,
  swift: LanguageName.SWIFT,
  kt: LanguageName.KOTLIN,
  html: LanguageName.HTML,
  css: LanguageName.CSS,
  json: LanguageName.JSON,
  lua: LanguageName.LUA,
  sql: LanguageName.SQL,
  md: LanguageName.MARKDOWN,
};

export function getFullLanguageName(filepath: string): LanguageName | undefined {
  const ext = getUriFileExtension(filepath);
  return (EXT_TO_LANGUAGE[ext] as LanguageName) || undefined;
}

export async function getParserForFile(filepath: string): Promise<any> {
  return undefined;
}

export async function getQueryForFile(filepath: string, queryName: string): Promise<any> {
  return undefined;
}

export async function getAst(filepath: string, code: string): Promise<any> {
  return undefined;
}

export function getFileSymbols(filepath: string, code: string): any[] {
  return [];
}

export function getStructureForFile(
  filepath: string,
  code: string,
): any[] {
  return [];
}

export type FileSymbolMap = Record<string, any[]>;
export type SymbolWithRange = any;

export const IGNORE_PATH_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.vscode/,
  /__pycache__/,
  /vendor/,
  /dist/,
  /build/,
];
