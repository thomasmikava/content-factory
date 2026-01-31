import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Engine } from "./engine";
import { TransmuteConfig, TransformContext } from "../types";
import fs from "fs/promises";
import path from "path";
import os from "os";

const getPathVariants = (inputPath: string): string[] => {
  return [
    inputPath,
    inputPath.replaceAll("/", "\\"),
    inputPath.replaceAll("\\", "/"),
  ];
};

describe("Engine", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "engine-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("run", () => {
    it("should process files matching strategy patterns", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "# Hello World");

      const transformFn = vi.fn().mockReturnValue({ files: [] });

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "markdown",
                matches: ["**/*.md"],
                transform: transformFn,
              },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(transformFn).toHaveBeenCalledTimes(1);
      expect(transformFn).toHaveBeenCalledWith(
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.objectContaining({
              name: "test.md",
              content: "# Hello World",
            }),
          ]),
        }),
      );
    });

    it("should write output files from transform result", async () => {
      await fs.writeFile(path.join(tempDir, "input.md"), "Input");

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["**/*.md"],
                transform: () => ({
                  files: [
                    {
                      path: path.join(tempDir, "output.txt"),
                      content: "Output",
                    },
                  ],
                }),
              },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      const outputContent = await fs.readFile(
        path.join(tempDir, "output.txt"),
        "utf-8",
      );
      expect(outputContent).toBe("Output");
    });

    it("should process multiple tools", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "Content");

      const tool1Transform = vi.fn().mockReturnValue({ files: [] });
      const tool2Transform = vi.fn().mockReturnValue({ files: [] });

      const config: TransmuteConfig = {
        tools: {
          tool1: {
            strategies: [
              { name: "s1", matches: ["**/*.md"], transform: tool1Transform },
            ],
          },
          tool2: {
            strategies: [
              { name: "s2", matches: ["**/*.md"], transform: tool2Transform },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(tool1Transform).toHaveBeenCalled();
      expect(tool2Transform).toHaveBeenCalled();
    });

    it("should process multiple strategies in a tool", async () => {
      await fs.writeFile(path.join(tempDir, "file.md"), "MD");
      await fs.writeFile(path.join(tempDir, "file.txt"), "TXT");

      const mdTransform = vi.fn().mockReturnValue({ files: [] });
      const txtTransform = vi.fn().mockReturnValue({ files: [] });

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "markdown",
                matches: ["**/*.md"],
                transform: mdTransform,
              },
              { name: "text", matches: ["**/*.txt"], transform: txtTransform },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(mdTransform).toHaveBeenCalled();
      expect(txtTransform).toHaveBeenCalled();
    });

    it("should group files by directory", async () => {
      const subDir = path.join(tempDir, "sub");
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(tempDir, "root.md"), "Root");
      await fs.writeFile(path.join(subDir, "sub.md"), "Sub");

      const transformCalls: TransformContext[] = [];
      const transformFn = vi.fn((ctx: TransformContext) => {
        transformCalls.push(ctx);
        return { files: [] };
      });

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              { name: "test", matches: ["**/*.md"], transform: transformFn },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(transformFn).toHaveBeenCalledTimes(2);

      const rootCall = transformCalls.find((c) =>
        getPathVariants(c.dir).includes(tempDir),
      );
      const subCall = transformCalls.find((c) =>
        getPathVariants(c.dir).includes(subDir),
      );

      expect(rootCall?.files.length).toBe(1);
      expect(rootCall?.files[0].name).toBe("root.md");

      expect(subCall?.files.length).toBe(1);
      expect(subCall?.files[0].name).toBe("sub.md");
    });

    it("should call onFinish with collected metadata", async () => {
      await fs.writeFile(path.join(tempDir, "a.md"), "A");

      const onFinishFn = vi.fn().mockReturnValue([]);

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["**/*.md"],
                transform: () => ({
                  files: [],
                  metadata: { processed: "a.md" },
                }),
              },
            ],
            onFinish: onFinishFn,
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(onFinishFn).toHaveBeenCalledWith({
        metadata: [{ processed: "a.md" }],
      });
    });

    it("should write files from onFinish result", async () => {
      await fs.writeFile(path.join(tempDir, "input.md"), "Input");

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["**/*.md"],
                transform: () => ({ files: [] }),
              },
            ],
            onFinish: () => [
              {
                path: path.join(tempDir, "final.txt"),
                content: "Final Output",
              },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      const finalContent = await fs.readFile(
        path.join(tempDir, "final.txt"),
        "utf-8",
      );
      expect(finalContent).toBe("Final Output");
    });

    it("should preprocess visibility filters", async () => {
      await fs.writeFile(
        path.join(tempDir, "test.md"),
        `Common<content-factory-filter include="tool1">Tool1 Only</content-factory-filter>`,
      );

      const tool1Transform = vi.fn().mockReturnValue({ files: [] });
      const tool2Transform = vi.fn().mockReturnValue({ files: [] });

      const config: TransmuteConfig = {
        tools: {
          tool1: {
            strategies: [
              { name: "test", matches: ["**/*.md"], transform: tool1Transform },
            ],
          },
          tool2: {
            strategies: [
              { name: "test", matches: ["**/*.md"], transform: tool2Transform },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(tool1Transform).toHaveBeenCalledWith(
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.objectContaining({ content: "CommonTool1 Only" }),
          ]),
        }),
      );

      expect(tool2Transform).toHaveBeenCalledWith(
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.objectContaining({ content: "Common" }),
          ]),
        }),
      );
    });

    it("should preprocess file includes", async () => {
      await fs.writeFile(path.join(tempDir, "partial.md"), "Partial Content");
      await fs.writeFile(
        path.join(tempDir, "main.md"),
        `Main-<content-factory-include-file path="./partial.md" />-Main`,
      );

      const transformFn = vi.fn().mockReturnValue({ files: [] });

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              { name: "test", matches: ["**/main.md"], transform: transformFn },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(transformFn).toHaveBeenCalledWith(
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.objectContaining({ content: "Main-Partial Content-Main" }),
          ]),
        }),
      );
    });

    it("should provide correct context to transform", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "Content");

      let capturedContext: TransformContext | null = null;
      const transformFn = vi.fn((ctx: TransformContext) => {
        capturedContext = ctx;
        return { files: [] };
      });

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              { name: "test", matches: ["**/*.md"], transform: transformFn },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.root).toBe(tempDir);
      expect(getPathVariants(tempDir).includes(capturedContext!.dir)).toBe(
        true,
      );
      expect(capturedContext!.config).toBe(config);
      expect(
        getPathVariants(capturedContext!.files[0].path).includes(
          path.join(tempDir, "test.md"),
        ),
      ).toBe(true);
      expect(capturedContext!.files[0].relativePath).toBe("test.md");
      expect(capturedContext!.files[0].extension).toBe(".md");
    });

    it("should handle transform errors gracefully", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "Content");

      const errorTransform = vi.fn().mockImplementation(() => {
        throw new Error("Transform failed");
      });

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              { name: "test", matches: ["**/*.md"], transform: errorTransform },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);

      // Should not throw
      await expect(engine.run()).resolves.toBeUndefined();
    });

    it("should handle onFinish errors gracefully", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "Content");

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["**/*.md"],
                transform: () => ({ files: [] }),
              },
            ],
            onFinish: () => {
              throw new Error("onFinish failed");
            },
          },
        },
      };

      const engine = new Engine(config, tempDir);

      // Should not throw
      await expect(engine.run()).resolves.toBeUndefined();
    });

    it("should handle async transforms", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "Content");

      const asyncTransform = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { files: [] };
      });

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              { name: "test", matches: ["**/*.md"], transform: asyncTransform },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(asyncTransform).toHaveBeenCalled();
    });

    it("should create nested output directories", async () => {
      await fs.writeFile(path.join(tempDir, "input.md"), "Input");

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["**/*.md"],
                transform: () => ({
                  files: [
                    {
                      path: path.join(tempDir, "deep", "nested", "output.txt"),
                      content: "Nested Output",
                    },
                  ],
                }),
              },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      const outputContent = await fs.readFile(
        path.join(tempDir, "deep", "nested", "output.txt"),
        "utf-8",
      );
      expect(outputContent).toBe("Nested Output");
    });

    it("should not call transform when no files match", async () => {
      await fs.writeFile(path.join(tempDir, "test.txt"), "Text file");

      const transformFn = vi.fn().mockReturnValue({ files: [] });

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              { name: "test", matches: ["**/*.md"], transform: transformFn },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      expect(transformFn).not.toHaveBeenCalled();
    });
  });
});
