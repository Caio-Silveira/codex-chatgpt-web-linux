import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export function supportsSymlinks(directory: string): boolean {
  mkdirSync(directory, { recursive: true });
  const target = join(directory, ".codex-symlink-target");
  const link = join(directory, ".codex-symlink-link");
  try {
    writeFileSync(target, "probe");
    symlinkSync(target, link);
    return lstatSync(link).isSymbolicLink();
  } catch {
    return false;
  } finally {
    rmSync(link, { force: true });
    rmSync(target, { force: true });
  }
}

export function createBinWrappers(nodeModules: string): number {
  const binDir = join(nodeModules, ".bin");
  mkdirSync(binDir, { recursive: true });
  const packages: string[] = [];
  for (const name of readdirSync(nodeModules)) {
    if (name === ".bin") continue;
    const path = join(nodeModules, name);
    if (name.startsWith("@")) {
      for (const scoped of readdirSync(path)) packages.push(join(path, scoped));
    } else packages.push(path);
  }
  let count = 0;
  for (const packageDir of packages) {
    let pkg: { name?: string; bin?: string | Record<string, string> };
    try { pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")); }
    catch { continue; }
    if (!pkg.bin) continue;
    const bins = typeof pkg.bin === "string"
      ? { [pkg.name?.split("/").pop() ?? "bin"]: pkg.bin }
      : pkg.bin;
    for (const [name, target] of Object.entries(bins)) {
      const destination = join(binDir, name);
      const targetPath = relative(dirname(destination), join(packageDir, target)).replaceAll("\\", "/");
      const electronSandboxFallback = process.platform === "linux" && name === "electron" ? " --no-sandbox" : "";
      writeFileSync(destination, `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/${targetPath}"${electronSandboxFallback} "$@"\n`);
      chmodSync(destination, 0o755);
      count++;
    }
  }
  return count;
}

if (import.meta.main) {
  const roots = [join(import.meta.dir, "..", "node_modules"), join(import.meta.dir, "..", "launcher", "node_modules")];
  for (const nodeModules of roots) {
    if (supportsSymlinks(nodeModules)) {
      console.log(`[linux-fs] symlinks supported: ${nodeModules}`);
      continue;
    }
    console.log(`[linux-fs] symlinks unavailable; generated ${createBinWrappers(nodeModules)} real .bin wrappers: ${nodeModules}`);
  }
}
