import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findFiles,
  removePathStartSegments,
  replacePathSegment,
} from "./fs";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("FS Utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("findFiles", () => {
    it("should find files matching a single pattern", async () => {
      await fs.writeFile(path.join(tempDir, "file1.md"), "");
      await fs.writeFile(path.join(tempDir, "file2.md"), "");
      await fs.writeFile(path.join(tempDir, "file3.txt"), "");

      const files = await findFiles(["**/*.md"], tempDir);

      expect(files).toHaveLength(2);
      expect(files.some((f) => f.endsWith("file1.md"))).toBe(true);
      expect(files.some((f) => f.endsWith("file2.md"))).toBe(true);
    });

    it("should find files matching multiple patterns", async () => {
      await fs.writeFile(path.join(tempDir, "file.md"), "");
      await fs.writeFile(path.join(tempDir, "file.txt"), "");
      await fs.writeFile(path.join(tempDir, "file.js"), "");

      const files = await findFiles(["**/*.md", "**/*.txt"], tempDir);

      expect(files).toHaveLength(2);
      expect(files.some((f) => f.endsWith(".md"))).toBe(true);
      expect(files.some((f) => f.endsWith(".txt"))).toBe(true);
      expect(files.some((f) => f.endsWith(".js"))).toBe(false);
    });

    it("should find files in nested directories", async () => {
      const nestedDir = path.join(tempDir, "a", "b", "c");
      await fs.mkdir(nestedDir, { recursive: true });
      await fs.writeFile(path.join(nestedDir, "deep.md"), "");

      const files = await findFiles(["**/*.md"], tempDir);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain("deep.md");
    });

    it("should ignore node_modules by default", async () => {
      const nodeModules = path.join(tempDir, "node_modules", "package");
      await fs.mkdir(nodeModules, { recursive: true });
      await fs.writeFile(path.join(nodeModules, "file.md"), "");
      await fs.writeFile(path.join(tempDir, "file.md"), "");

      const files = await findFiles(["**/*.md"], tempDir);

      expect(files).toHaveLength(1);
      expect(files[0]).not.toContain("node_modules");
    });

    it("should find dot files when pattern allows", async () => {
      await fs.writeFile(path.join(tempDir, ".hidden.md"), "");
      await fs.writeFile(path.join(tempDir, "visible.md"), "");

      const files = await findFiles(["**/*.md"], tempDir);

      expect(files).toHaveLength(2);
      expect(files.some((f) => f.includes(".hidden.md"))).toBe(true);
    });

    it("should return absolute paths", async () => {
      await fs.writeFile(path.join(tempDir, "file.md"), "");

      const files = await findFiles(["**/*.md"], tempDir);

      expect(files).toHaveLength(1);
      expect(path.isAbsolute(files[0])).toBe(true);
    });

    it("should return empty array when no matches", async () => {
      await fs.writeFile(path.join(tempDir, "file.txt"), "");

      const files = await findFiles(["**/*.md"], tempDir);

      expect(files).toHaveLength(0);
    });
  });

  describe("removePathStartSegments", () => {
    it("should remove first segment by default", () => {
      const result = removePathStartSegments("a/b/c/d");
      expect(result).toBe(path.join("b", "c", "d"));
    });

    it("should remove specified number of segments", () => {
      const result = removePathStartSegments("a/b/c/d", 2);
      expect(result).toBe(path.join("c", "d"));
    });

    it("should handle leading slash", () => {
      const result = removePathStartSegments("/a/b/c", 1);
      expect(result).toBe(path.sep + path.join("b", "c"));
    });

    it("should return empty string if count exceeds segments", () => {
      const result = removePathStartSegments("a/b", 3);
      expect(result).toBe("");
    });

    it("should return empty string if count equals segments", () => {
      const result = removePathStartSegments("a/b", 2);
      expect(result).toBe("");
    });

    it("should handle backslashes (Windows-style paths)", () => {
      const result = removePathStartSegments("a\\b\\c\\d", 1);
      expect(result).toBe(path.join("b", "c", "d"));
    });

    it("should handle mixed slashes", () => {
      const result = removePathStartSegments("a/b\\c/d", 2);
      expect(result).toBe(path.join("c", "d"));
    });

    it("should handle double slashes", () => {
      const result = removePathStartSegments("a//b/c", 1);
      expect(result).toBe(path.join("b", "c"));
    });
  });

  describe("replacePathSegment", () => {
    it("should replace a single segment", () => {
      const result = replacePathSegment("a/b/c", "b", "x");
      expect(result).toBe(path.normalize("a/x/c"));
    });

    it("should replace multiple consecutive segments", () => {
      const result = replacePathSegment("a/b/c/d", "b/c", "x/y");
      expect(result).toBe(path.normalize("a/x/y/d"));
    });

    it("should return normalized path if no match found", () => {
      const result = replacePathSegment("a/b/c", "x", "y");
      expect(result).toBe(path.normalize("a/b/c"));
    });

    it("should handle leading slash", () => {
      const result = replacePathSegment("/a/b/c", "b", "x");
      expect(result).toBe(path.sep + path.normalize("a/x/c"));
    });

    it("should only replace first match", () => {
      const result = replacePathSegment("a/b/a/b", "a", "x");
      expect(result).toBe(path.normalize("x/b/a/b"));
    });

    it("should handle backslashes", () => {
      const result = replacePathSegment("a\\b\\c", "b", "x");
      expect(result).toBe(path.normalize("a/x/c"));
    });

    it("should handle match at start", () => {
      const result = replacePathSegment("a/b/c", "a", "x");
      expect(result).toBe(path.normalize("x/b/c"));
    });

    it("should handle match at end", () => {
      const result = replacePathSegment("a/b/c", "c", "x");
      expect(result).toBe(path.normalize("a/b/x"));
    });

    it("should handle empty replacement", () => {
      const result = replacePathSegment("a/b/c", "b", "");
      expect(result).toBe(path.normalize("a/c"));
    });
  });
});
