import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBinWrappers, supportsSymlinks } from "../scripts/prepare-linux-filesystem";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Linux filesystem preparation", () => {
  test("detects symlink support on a normal Unix filesystem", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-symlink-")); roots.push(root);
    expect(supportsSymlinks(root)).toBe(true);
  });

  test("creates real executable wrappers from package bin metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-bins-")); roots.push(root);
    const modules = join(root, "node_modules");
    const pkg = join(modules, "example");
    mkdirSync(join(pkg, "cli"), { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "example", bin: { example: "./cli/index.js" } }));
    writeFileSync(join(pkg, "cli", "index.js"), "console.log('ok')\n");
    expect(createBinWrappers(modules)).toBe(1);
    const wrapper = readFileSync(join(modules, ".bin", "example"), "utf8");
    expect(wrapper).toContain("../example/cli/index.js");
    expect(wrapper).toStartWith("#!/bin/sh");
  });

  test("adds the Electron sandbox fallback only to Linux Electron wrappers", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-electron-bin-")); roots.push(root);
    const modules = join(root, "node_modules");
    const pkg = join(modules, "electron");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "electron", bin: { electron: "cli.js" } }));
    writeFileSync(join(pkg, "cli.js"), "console.log('electron')\n");
    createBinWrappers(modules);
    const wrapper = readFileSync(join(modules, ".bin", "electron"), "utf8");
    if (process.platform === "linux") expect(wrapper).toContain("--no-sandbox");
    else expect(wrapper).not.toContain("--no-sandbox");
  });
});
