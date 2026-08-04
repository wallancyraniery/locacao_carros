import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind);
}

describe('módulos "use server"', () => {
  it("exportam em runtime somente funções assíncronas", () => {
    const invalidExports: string[] = [];

    for (const file of globSync("src/**/*.{ts,tsx}")) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const isUseServerModule = source.statements.some(
        (statement) => ts.isExpressionStatement(statement)
          && ts.isStringLiteral(statement.expression)
          && statement.expression.text === "use server",
      );
      if (!isUseServerModule) continue;

      for (const statement of source.statements) {
        if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
        if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;

        const isAsyncFunction = ts.isFunctionDeclaration(statement)
          && hasModifier(statement, ts.SyntaxKind.AsyncKeyword);
        if (!isAsyncFunction) invalidExports.push(`${file}: ${statement.getText(source)}`);
      }
    }

    expect(invalidExports).toEqual([]);
  });
});
