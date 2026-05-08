import { IDE } from "../..";
import {
  AutocompleteCodeSnippet,
  AutocompleteSnippetType,
  AutocompleteStaticSnippet,
} from "../snippets/types";
import { HelperVars } from "../util/HelperVars";

import { ImportDefinitionsService } from "./ImportDefinitionsService";
import { getSymbolsForSnippet } from "./ranking";
import { RootPathContextService } from "./root-path-context/RootPathContextService";
import { StaticContextService } from "./static-context/StaticContextService";

export class ContextRetrievalService {
  private importDefinitionsService: ImportDefinitionsService;
  private rootPathContextService: RootPathContextService;
  private staticContextService: StaticContextService;

  constructor(private readonly ide: IDE) {
    this.importDefinitionsService = new ImportDefinitionsService(this.ide);
    this.rootPathContextService = new RootPathContextService(
      this.importDefinitionsService,
      this.ide,
    );
    this.staticContextService = new StaticContextService(this.ide);
  }

  public async getSnippetsFromImportDefinitions(
    helper: HelperVars,
  ): Promise<AutocompleteCodeSnippet[]> {
    if (helper.options.useImports === false) {
      return [];
    }

    const importSnippets: AutocompleteCodeSnippet[] = [];
    const fileInfo = this.importDefinitionsService.get(helper.filepath);
    if (fileInfo) {
      const { imports } = fileInfo;
      // Look for imports of any symbols around the current range
      const textAroundCursor =
        helper.fullPrefix.split("\n").slice(-5).join("\n") +
        helper.fullSuffix.split("\n").slice(0, 3).join("\n");
      const symbols = Array.from(getSymbolsForSnippet(textAroundCursor)).filter(
        (symbol) => !helper.lang.topLevelKeywords.includes(symbol),
      );
      for (const symbol of symbols) {
        const rifs = imports[symbol];
        if (Array.isArray(rifs)) {
          const snippets: AutocompleteCodeSnippet[] = rifs.map((rif) => {
            return {
              filepath: rif.filepath,
              content: rif.contents,
              type: AutocompleteSnippetType.Code,
            };
          });

          importSnippets.push(...snippets);
        }
      }
    }

    return importSnippets;
  }

  public async getRootPathSnippets(
    helper: HelperVars,
  ): Promise<AutocompleteCodeSnippet[]> {
    if (!helper.treePath) {
      return this.getRootPathSnippetsFromDocumentSymbols(helper);
    }

    return this.rootPathContextService.getContextForPath(
      helper.filepath,
      helper.treePath,
    );
  }

  private async getRootPathSnippetsFromDocumentSymbols(
    helper: HelperVars,
  ): Promise<AutocompleteCodeSnippet[]> {
    let symbols: any[] = [];
    try {
      symbols = await this.ide.getDocumentSymbols(helper.filepath);
    } catch {
      return [];
    }

    const containingPath = getContainingSymbolPath(symbols, helper.pos);
    const snippets: AutocompleteCodeSnippet[] = [];
    const seen = new Set<string>();

    for (const symbol of containingPath.slice(-3)) {
      const range = getSymbolRange(symbol);
      if (!range || range.end.line - range.start.line > 300) {
        continue;
      }

      const key = `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      try {
        const content = await this.ide.readRangeInFile(helper.filepath, range);
        if (
          content.trim() !== "" &&
          !helper.prunedCaretWindow.includes(content.trim())
        ) {
          snippets.push({
            filepath: helper.filepath,
            content,
            type: AutocompleteSnippetType.Code,
          });
        }
      } catch {
        // Document symbols are optional context.
      }
    }

    return snippets;
  }

  public async getStaticContextSnippets(
    helper: HelperVars,
  ): Promise<AutocompleteStaticSnippet[]> {
    return this.staticContextService.getContext(helper);
  }

  /**
   * Initialize the import definitions cache for a file.
   * This is normally done automatically when the active text editor changes,
   * but needs to be called manually when using context fetching outside the normal flow.
   */
  public async initializeForFile(filepath: string): Promise<void> {
    try {
      await (this.importDefinitionsService as any).cache.initKey(filepath);
    } catch (e) {
      console.warn(
        `Failed to initialize import definitions cache for ${filepath}:`,
        e,
      );
    }
  }
}

function getContainingSymbolPath(symbols: any[], position: { line: number; character: number }): any[] {
  for (const symbol of symbols) {
    const range = getSymbolRange(symbol);
    if (!range || !rangeContainsPosition(range, position)) {
      continue;
    }

    const children = getSymbolChildren(symbol);
    return [symbol, ...getContainingSymbolPath(children, position)];
  }

  return [];
}

function getSymbolRange(symbol: any) {
  return symbol?.range ?? symbol?.location?.range;
}

function getSymbolChildren(symbol: any): any[] {
  return Array.isArray(symbol?.children) ? symbol.children : [];
}

function rangeContainsPosition(
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
  position: { line: number; character: number },
) {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  if (position.line === range.end.line && position.character > range.end.character) {
    return false;
  }
  return true;
}
