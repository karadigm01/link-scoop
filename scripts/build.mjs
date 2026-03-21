import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(currentFilePath), '..');
const sourceDir = path.join(workspaceRoot, 'src', 'extension');
const outputDir = path.join(workspaceRoot, 'build', 'link-scoop');

async function ensureSourceExists() {
  try {
    const sourceStats = await stat(sourceDir);
    if (!sourceStats.isDirectory()) {
      throw new Error(`Source path is not a directory: ${sourceDir}`);
    }
  } catch (error) {
    throw new Error(`Missing extension source directory: ${sourceDir}`);
  }
}

async function build() {
  await ensureSourceExists();
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(sourceDir, outputDir, { recursive: true });
  console.log(`Built Link Scoop into ${outputDir}`);
}

build().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
