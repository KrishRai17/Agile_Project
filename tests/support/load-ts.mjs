// Loads a TypeScript source file from the project so tests exercise the REAL code.
// Uses the TypeScript compiler already in devDependencies, so it works on any Node >= 20
// (no --experimental-strip-types needed). Relative sibling imports ("./db") and "@/lib/*" alias
// imports are transpiled recursively; bare "next/*" imports are resolved from the project's
// node_modules, so the real Next.js App Router route handlers (app/api/**/route.ts) can be loaded too.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, basename, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(tmpdir(), `hopon-test-build-${process.pid}`);
const projectRequire = createRequire(join(projectRoot, "package.json"));
let loadCounter = 0;

/** lib/*.ts keep their basename (shared instances); other files (e.g. many route.ts) get a unique name. */
function outNameFor(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("lib/") && !normalized.slice(4).includes("/")) {
    return `${basename(normalized, ".ts")}.mjs`;
  }
  return `${normalized.replace(/\.ts$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")}.mjs`;
}

function transpileToOutDir(relativePath) {
  const source = readFileSync(join(projectRoot, relativePath), "utf8");
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });

  mkdirSync(outDir, { recursive: true });

  // Bare Next.js imports resolve from the project (the temp dir has no node_modules)
  outputText = outputText.replace(/from\s+["'](next\/[a-zA-Z0-9_/-]+)["']/g, (_match, spec) => {
    return `from "${pathToFileURL(projectRequire.resolve(spec)).href}"`;
  });

  // "@/lib/x" alias imports -> transpiled lib/x.ts
  outputText = outputText.replace(/from\s+["']@\/lib\/([a-zA-Z0-9_-]+)["']/g, (_match, depName) => {
    transpileToOutDir(join("lib", `${depName}.ts`));
    return `from "./${depName}.mjs"`;
  });

  if (/from\s+["']@\//.test(outputText)) {
    throw new Error(`${relativePath} uses "@/" imports outside lib/; tests cannot load it.`);
  }

  // Transpile any relative sibling imports (e.g. "./db") into outDir as well
  outputText = outputText.replace(/from\s+["']\.\/([a-zA-Z0-9_-]+)["']/g, (_match, depName) => {
    const depRelPath = join(dirname(relativePath), `${depName}.ts`);
    const depOut = transpileToOutDir(depRelPath);
    return `from "./${basename(depOut)}"`;
  });

  const outFile = join(outDir, outNameFor(relativePath));
  writeFileSync(outFile, outputText);
  return outFile;
}

export async function loadTs(relativePath) {
  const outFile = transpileToOutDir(relativePath);
  // The query string busts Node's module cache, so loading the same file twice gives a fresh instance
  // (needed to test things that happen at module load, like restoring persisted data).
  return import(`${pathToFileURL(outFile).href}?load=${++loadCounter}`);
}
