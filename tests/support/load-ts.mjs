// Loads a TypeScript source file from the project so tests exercise the REAL code.
// Uses the TypeScript compiler already in devDependencies, so it works on any Node >= 20
// (no --experimental-strip-types needed). Only supports files with no project-alias imports
// and no value imports of other project files (type-only imports are erased and are fine).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(tmpdir(), `hopon-test-build-${process.pid}`);
let loadCounter = 0;

function transpileToOutDir(relativePath) {
  const source = readFileSync(join(projectRoot, relativePath), "utf8");
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });

  if (/from\s+["']@\//.test(outputText)) {
    throw new Error(`${relativePath} uses "@/" imports; tests can only load dependency-free modules.`);
  }

  mkdirSync(outDir, { recursive: true });

  // Transpile any relative sibling imports (e.g. "./db") into outDir as well
  outputText = outputText.replace(/from\s+["']\.\/([a-zA-Z0-9_-]+)["']/g, (_match, depName) => {
    const depRelPath = join(dirname(relativePath), `${depName}.ts`);
    transpileToOutDir(depRelPath);
    return `from "./${depName}.mjs"`;
  });

  const outFile = join(outDir, `${basename(relativePath, ".ts")}.mjs`);
  writeFileSync(outFile, outputText);
  return outFile;
}

export async function loadTs(relativePath) {
  const outFile = transpileToOutDir(relativePath);
  // The query string busts Node's module cache, so loading the same file twice gives a fresh instance
  // (needed to test things that happen at module load, like restoring persisted data).
  return import(`${pathToFileURL(outFile).href}?load=${++loadCounter}`);
}
