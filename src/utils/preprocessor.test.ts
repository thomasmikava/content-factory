import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Preprocessor } from "./preprocessor";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("Preprocessor", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preprocessor-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("processVisibility (content-factory-filter)", () => {
    it("should keep content when no filter tags are present", async () => {
      const content = "Hello World";
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("Hello World");
    });

    it("should keep content when tool is included", async () => {
      const content = `Before<content-factory-filter include="claude">Inner</content-factory-filter>After`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("BeforeInnerAfter");
    });

    it("should remove content when tool is not included", async () => {
      const content = `Before<content-factory-filter include="roo">Inner</content-factory-filter>After`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("BeforeAfter");
    });

    it("should remove content when tool is excluded", async () => {
      const content = `Before<content-factory-filter exclude="claude">Inner</content-factory-filter>After`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("BeforeAfter");
    });

    it("should keep content when tool is not in exclude list", async () => {
      const content = `Before<content-factory-filter exclude="roo">Inner</content-factory-filter>After`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("BeforeInnerAfter");
    });

    it("should handle multiple tools in include list", async () => {
      const content = `<content-factory-filter include="claude, roo, copilot">Content</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "roo",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("Content");
    });

    it("should handle multiple tools in exclude list", async () => {
      const content = `<content-factory-filter exclude="claude, roo">Content</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "copilot",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("Content");
    });

    it("should handle both include and exclude (exclude takes precedence)", async () => {
      const content = `<content-factory-filter include="claude, roo" exclude="claude">Content</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("");
    });

    it("should handle nested filter tags", async () => {
      const content = `<content-factory-filter include="claude">Outer<content-factory-filter include="claude">Inner</content-factory-filter>OuterEnd</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("OuterInnerOuterEnd");
    });

    it("should handle nested filter tags with different tools", async () => {
      const content = `<content-factory-filter include="claude">Outer<content-factory-filter include="roo">Inner</content-factory-filter>OuterEnd</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("OuterOuterEnd");
    });

    it("should handle multiple sibling filter tags", async () => {
      const content = `<content-factory-filter include="claude">A</content-factory-filter><content-factory-filter include="roo">B</content-factory-filter><content-factory-filter include="claude">C</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("AC");
    });

    it("should handle spaces around equals sign in attributes", async () => {
      const content = `<content-factory-filter include = "claude">Content</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("Content");
    });

    it("should handle single quotes in attributes", async () => {
      const content = `<content-factory-filter include='claude'>Content</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("Content");
    });

    it("should keep all content when no include/exclude specified", async () => {
      const content = `<content-factory-filter>Content</content-factory-filter>`;
      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: path.join(tempDir, "test.md"),
      });
      expect(result).toBe("Content");
    });
  });

  describe("processIncludes (content-factory-include-file)", () => {
    it("should include file content with relative path", async () => {
      const includedFile = path.join(tempDir, "partial.md");
      await fs.writeFile(includedFile, "Included Content");

      const mainFile = path.join(tempDir, "main.md");
      const content = `Before<content-factory-include-file path="./partial.md" />After`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("BeforeIncluded ContentAfter");
    });

    it("should include file content with root-relative path (@/ prefix)", async () => {
      const partialsDir = path.join(tempDir, "partials");
      await fs.mkdir(partialsDir);
      await fs.writeFile(path.join(partialsDir, "footer.md"), "Footer Content");

      const mainFile = path.join(tempDir, "main.md");
      const content = `<content-factory-include-file path="@/partials/footer.md" />`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("Footer Content");
    });

    it("should include file content with parent directory path (../)", async () => {
      const partialsDir = path.join(tempDir, "partials");
      await fs.mkdir(partialsDir);
      await fs.writeFile(path.join(partialsDir, "shared.md"), "Shared Content");

      const subDir = path.join(tempDir, "sub");
      await fs.mkdir(subDir);
      const mainFile = path.join(subDir, "main.md");

      const content = `<content-factory-include-file path="../partials/shared.md" />`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("Shared Content");
    });

    it("should handle self-closing tag with spaces", async () => {
      const includedFile = path.join(tempDir, "partial.md");
      await fs.writeFile(includedFile, "Content");

      const mainFile = path.join(tempDir, "main.md");
      const content = `<content-factory-include-file path = "./partial.md" />`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("Content");
    });

    it("should handle explicit closing tag", async () => {
      const includedFile = path.join(tempDir, "partial.md");
      await fs.writeFile(includedFile, "Content");

      const mainFile = path.join(tempDir, "main.md");
      const content = `<content-factory-include-file path="./partial.md"></content-factory-include-file>`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("Content");
    });

    it("should handle multiple includes", async () => {
      await fs.writeFile(path.join(tempDir, "a.md"), "A");
      await fs.writeFile(path.join(tempDir, "b.md"), "B");
      await fs.writeFile(path.join(tempDir, "c.md"), "C");

      const mainFile = path.join(tempDir, "main.md");
      const content = `<content-factory-include-file path="./a.md" />-<content-factory-include-file path="./b.md" />-<content-factory-include-file path="./c.md" />`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("A-B-C");
    });

    it("should handle missing file gracefully", async () => {
      const mainFile = path.join(tempDir, "main.md");
      const content = `Before<content-factory-include-file path="./missing.md" />After`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("Before[MISSING FILE: ./missing.md]After");
    });

    it("should recursively process included files", async () => {
      await fs.writeFile(path.join(tempDir, "level2.md"), "Level2Content");
      await fs.writeFile(
        path.join(tempDir, "level1.md"),
        `Level1-<content-factory-include-file path="./level2.md" />-Level1`,
      );

      const mainFile = path.join(tempDir, "main.md");
      const content = `Main-<content-factory-include-file path="./level1.md" />-Main`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("Main-Level1-Level2Content-Level1-Main");
    });

    it("should detect circular dependencies and throw error", async () => {
      // Create circular reference: main -> a -> b -> a
      await fs.writeFile(
        path.join(tempDir, "a.md"),
        `A-<content-factory-include-file path="./b.md" />`,
      );
      await fs.writeFile(
        path.join(tempDir, "b.md"),
        `B-<content-factory-include-file path="./a.md" />`,
      );

      const mainFile = path.join(tempDir, "main.md");
      const content = `<content-factory-include-file path="./a.md" />`;

      await expect(
        Preprocessor.process({
          content,
          toolName: "claude",
          rootPath: tempDir,
          currentFilePath: mainFile,
        }),
      ).rejects.toThrow(/Circular dependency detected/);
    });

    it("should detect self-referencing circular dependency", async () => {
      const selfRefFile = path.join(tempDir, "self.md");
      await fs.writeFile(
        selfRefFile,
        `Content-<content-factory-include-file path="./self.md" />`,
      );

      await expect(
        Preprocessor.process({
          content: `<content-factory-include-file path="./self.md" />`,
          toolName: "claude",
          rootPath: tempDir,
          currentFilePath: path.join(tempDir, "main.md"),
        }),
      ).rejects.toThrow(/Circular dependency detected/);
    });

    it("should allow same file to be included in different branches", async () => {
      await fs.writeFile(path.join(tempDir, "shared.md"), "Shared");

      const mainFile = path.join(tempDir, "main.md");
      const content = `<content-factory-include-file path="./shared.md" />-<content-factory-include-file path="./shared.md" />`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("Shared-Shared");
    });
  });

  describe("combined visibility and includes", () => {
    it("should process visibility before includes", async () => {
      await fs.writeFile(
        path.join(tempDir, "claude-only.md"),
        "Claude Content",
      );
      await fs.writeFile(path.join(tempDir, "roo-only.md"), "Roo Content");

      const mainFile = path.join(tempDir, "main.md");
      const content = `
<content-factory-filter include="claude">
<content-factory-include-file path="./claude-only.md" />
</content-factory-filter>
<content-factory-filter include="roo">
<content-factory-include-file path="./roo-only.md" />
</content-factory-filter>
`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toContain("Claude Content");
      expect(result).not.toContain("Roo Content");
    });

    it("should process visibility in included files", async () => {
      await fs.writeFile(
        path.join(tempDir, "partial.md"),
        `Common<content-factory-filter include="claude">Claude Only</content-factory-filter><content-factory-filter include="roo">Roo Only</content-factory-filter>`,
      );

      const mainFile = path.join(tempDir, "main.md");
      const content = `<content-factory-include-file path="./partial.md" />`;

      const result = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(result).toBe("CommonClaude Only");
    });

    it("should handle includes inside included files with visibility", async () => {
      await fs.writeFile(path.join(tempDir, "deep.md"), "Deep Content");
      await fs.writeFile(
        path.join(tempDir, "middle.md"),
        `Middle-<content-factory-filter include="claude"><content-factory-include-file path="./deep.md" /></content-factory-filter>-Middle`,
      );

      const mainFile = path.join(tempDir, "main.md");
      const content = `<content-factory-include-file path="./middle.md" />`;

      const resultClaude = await Preprocessor.process({
        content,
        toolName: "claude",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(resultClaude).toBe("Middle-Deep Content-Middle");

      const resultRoo = await Preprocessor.process({
        content,
        toolName: "roo",
        rootPath: tempDir,
        currentFilePath: mainFile,
      });

      expect(resultRoo).toBe("Middle--Middle");
    });
  });
});
