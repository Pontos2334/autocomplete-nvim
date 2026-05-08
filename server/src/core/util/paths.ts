// Simplified paths utility for standalone autocomplete
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const AUTOCOMPLETE_GLOBAL_DIR = path.join(os.homedir(), ".autocomplete-vscode");

export function getContinueGlobalPath(): string {
  if (!fs.existsSync(AUTOCOMPLETE_GLOBAL_DIR)) {
    fs.mkdirSync(AUTOCOMPLETE_GLOBAL_DIR, { recursive: true });
  }
  return AUTOCOMPLETE_GLOBAL_DIR;
}

export function getTabAutocompleteCacheSqlitePath(): string {
  return path.join(getContinueGlobalPath(), "autocomplete-cache.db");
}

export function getConfigYamlPath(): string {
  return path.join(getContinueGlobalPath(), "config.json");
}

export function getDataDir(): string {
  const dataDir = path.join(getContinueGlobalPath(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

export function getConfigJsonPath(): string {
  return path.join(getContinueGlobalPath(), "config.json");
}

export function getConfigTsPath(): string {
  return path.join(getContinueGlobalPath(), "config.ts");
}
