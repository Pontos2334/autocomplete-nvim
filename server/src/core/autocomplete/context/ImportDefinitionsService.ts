import { IDE, RangeInFileWithContents } from "../..";
import { PrecalculatedLruCache } from "../../util/LruCache";
import {
  getFullLanguageName,
  getParserForFile,
  getQueryForFile,
} from "../../util/treeSitter";
import { findUriInDirs } from "../../util/uri";
import { getSymbolsForSnippet } from "./ranking";

interface FileInfo {
  imports: { [key: string]: RangeInFileWithContents[] };
}

const IMPORT_LINE_RE =
  /^\s*(import|from|export\s+.*\s+from|const\s+.+require|let\s+.+require|var\s+.+require|use|#include)\b/;
const IMPORT_KEYWORDS = new Set([
  "as",
  "const",
  "default",
  "export",
  "from",
  "import",
  "let",
  "require",
  "type",
  "use",
  "var",
]);

export class ImportDefinitionsService {
  static N = 10;

  private cache: PrecalculatedLruCache<FileInfo> =
    new PrecalculatedLruCache<FileInfo>(
      this._getFileInfo.bind(this),
      ImportDefinitionsService.N,
    );

  constructor(private readonly ide: IDE) {
    ide.onDidChangeActiveTextEditor((filepath) => {
      this.cache
        .initKey(filepath)
        .catch((e) =>
          console.warn(
            `Failed to initialize ImportDefinitionService: ${e.message}`,
          ),
        );
    });
  }

  get(filepath: string): FileInfo | undefined {
    return this.cache.get(filepath);
  }

  private async _getFileInfo(filepath: string): Promise<FileInfo | null> {
    if (filepath.endsWith(".ipynb")) {
      // Commenting out this line was the solution to https://github.com/continuedev/continue/issues/1463
      return null;
    }

    let fileContents: string | undefined = undefined;
    try {
      const { foundInDir } = findUriInDirs(
        filepath,
        await this.ide.getWorkspaceDirs(),
      );
      if (!foundInDir) {
        return null;
      } else {
        fileContents = await this.ide.readFile(filepath);
      }
    } catch (err) {
      // File removed
      return null;
    }

    const parser = await getParserForFile(filepath);
    if (!parser) {
      return this.getFileInfoFromLspImports(filepath, fileContents);
    }

    const ast = parser.parse(fileContents, undefined, {
      includedRanges: [
        {
          startIndex: 0,
          endIndex: 10_000,
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 100, column: 0 },
        },
      ],
    });
    const language = getFullLanguageName(filepath);
    const query = await getQueryForFile(
      filepath,
      `import-queries/${language}.scm`,
    );
    if (!query) {
      return {
        imports: {},
      };
    }

    const matches = query?.matches(ast.rootNode);

    const fileInfo: FileInfo = {
      imports: {},
    };
    for (const match of matches) {
      const startPosition = match.captures[0].node.startPosition;
      const defs = await this.ide.gotoDefinition({
        filepath,
        position: {
          line: startPosition.row,
          character: startPosition.column,
        },
      });
      fileInfo.imports[match.captures[0].node.text] = await Promise.all(
        defs.map(async (def) => ({
          ...def,
          contents: await this.ide.readRangeInFile(def.filepath, def.range),
        })),
      );
    }

    return fileInfo;
  }

  private async getFileInfoFromLspImports(
    filepath: string,
    fileContents: string,
  ): Promise<FileInfo> {
    const imports: FileInfo["imports"] = {};
    const lines = fileContents.split("\n").slice(0, 200);
    const candidates: { symbol: string; line: number; character: number }[] =
      [];
    const seen = new Set<string>();

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      if (!IMPORT_LINE_RE.test(line)) {
        continue;
      }

      for (const symbol of getSymbolsForSnippet(line)) {
        if (
          IMPORT_KEYWORDS.has(symbol) ||
          !/^[A-Za-z_$][\w$]*$/.test(symbol)
        ) {
          continue;
        }

        const character = line.indexOf(symbol);
        const key = `${symbol}:${lineNumber}:${character}`;
        if (character < 0 || seen.has(key)) {
          continue;
        }

        seen.add(key);
        candidates.push({ symbol, line: lineNumber, character });
      }
    }

    for (const candidate of candidates.slice(0, 40)) {
      try {
        const defs = await this.ide.gotoDefinition({
          filepath,
          position: {
            line: candidate.line,
            character: candidate.character,
          },
        });

        const ranges = (
          await Promise.all(
            defs.slice(0, 3).map(async (def) => ({
              ...def,
              contents: await this.ide.readRangeInFile(def.filepath, def.range),
            })),
          )
        ).filter((range) => range.contents.trim() !== "");

        if (ranges.length > 0) {
          imports[candidate.symbol] = [
            ...(imports[candidate.symbol] ?? []),
            ...ranges,
          ];
        }
      } catch {
        // Definition providers are best-effort context.
      }
    }

    return { imports };
  }
}
