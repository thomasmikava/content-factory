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

    it("should call onFinish with collected metadata and engine", async () => {
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
        engine: engine,
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
            onFinish: () => ({
              files: [
                {
                  path: path.join(tempDir, "final.txt"),
                  content: "Final Output",
                },
              ],
            }),
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

    it("should provide correct context to transform including engine", async () => {
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
      expect(capturedContext!.engine).toBe(engine);
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

    it("should delete files specified in transform result", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "Content");
      await fs.writeFile(path.join(tempDir, "file-to-delete.txt"), "delete me");

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["**/*.md"],
                transform: () => ({
                  files: [],
                  deleteFiles: ["**/*.txt"],
                }),
              },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      const files = await fs.readdir(tempDir);
      expect(files).not.toContain("file-to-delete.txt");
      expect(files).toContain("test.md");
    });

    it("should delete files specified in onFinish result", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "Content");
      await fs.writeFile(path.join(tempDir, "file-to-delete.txt"), "delete me");

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
            onFinish: () => ({
              files: [],
              deleteFiles: ["**/*.txt"],
            }),
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      const files = await fs.readdir(tempDir);
      expect(files).not.toContain("file-to-delete.txt");
      expect(files).toContain("test.md");
    });
  });

  describe("readFile", () => {
    it("should read a file relative to project root", async () => {
      await fs.writeFile(path.join(tempDir, "test.md"), "Hello World");

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const result = await engine.readFile("test.md", {
        toolName: "claude",
        strategyName: "default",
      });

      expect(result.name).toBe("test.md");
      expect(result.content).toBe("Hello World");
      expect(result.relativePath).toBe("test.md");
      expect(result.extension).toBe(".md");
      expect(path.isAbsolute(result.path)).toBe(true);
    });

    it("should read a file with @/ root-relative path", async () => {
      const subDir = path.join(tempDir, "shared");
      await fs.mkdir(subDir);
      await fs.writeFile(path.join(subDir, "header.md"), "Header");

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const result = await engine.readFile("@/shared/header.md", {
        toolName: "claude",
        strategyName: "default",
      });

      expect(result.name).toBe("header.md");
      expect(result.content).toBe("Header");
    });

    it("should read a file with absolute path", async () => {
      const filePath = path.join(tempDir, "absolute.md");
      await fs.writeFile(filePath, "Absolute");

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const result = await engine.readFile(filePath, {
        toolName: "claude",
        strategyName: "default",
      });

      expect(result.name).toBe("absolute.md");
      expect(result.content).toBe("Absolute");
    });

    it("should apply visibility filters", async () => {
      await fs.writeFile(
        path.join(tempDir, "filtered.md"),
        `Common<content-factory-filter include="claude">Claude Only</content-factory-filter><content-factory-filter include="roo">Roo Only</content-factory-filter>`,
      );

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const claudeResult = await engine.readFile("filtered.md", {
        toolName: "claude",
        strategyName: "default",
      });
      expect(claudeResult.content).toBe("CommonClaude Only");

      const rooResult = await engine.readFile("filtered.md", {
        toolName: "roo",
        strategyName: "default",
      });
      expect(rooResult.content).toBe("CommonRoo Only");
    });

    it("should resolve file includes", async () => {
      await fs.writeFile(path.join(tempDir, "partial.md"), "Included");
      await fs.writeFile(
        path.join(tempDir, "main.md"),
        `Before-<content-factory-include-file path="./partial.md" />-After`,
      );

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const result = await engine.readFile("main.md", {
        toolName: "claude",
        strategyName: "default",
      });

      expect(result.content).toBe("Before-Included-After");
    });

    it("should apply pipelines when specified", async () => {
      await fs.writeFile(path.join(tempDir, "source.md"), "hello world");

      const config: TransmuteConfig = {
        tools: {},
        pipelines: {
          uppercase: async () => ({
            content: "HELLO WORLD",
          }),
        },
      };
      const engine = new Engine(config, tempDir);

      const result = await engine.readFile("source.md", {
        toolName: "claude",
        strategyName: "default",
        pipelines: "uppercase",
      });

      expect(result.content).toBe("HELLO WORLD");
    });

    it("should apply chained pipelines", async () => {
      await fs.writeFile(path.join(tempDir, "source.md"), "hello");

      const config: TransmuteConfig = {
        tools: {},
        pipelines: {
          "append-world": async () => ({
            content: "hello world",
          }),
          uppercase: async () => ({
            content: "HELLO WORLD",
          }),
        },
      };
      const engine = new Engine(config, tempDir);

      const result = await engine.readFile("source.md", {
        toolName: "claude",
        strategyName: "default",
        pipelines: "append-world, uppercase",
      });

      expect(result.content).toBe("HELLO WORLD");
    });

    it("should not apply pipelines when not specified", async () => {
      await fs.writeFile(path.join(tempDir, "source.md"), "original");

      const pipelineFn = vi.fn(async () => ({ content: "MODIFIED" }));

      const config: TransmuteConfig = {
        tools: {},
        pipelines: { uppercase: pipelineFn },
      };
      const engine = new Engine(config, tempDir);

      const result = await engine.readFile("source.md", {
        toolName: "claude",
        strategyName: "default",
      });

      expect(result.content).toBe("original");
      expect(pipelineFn).not.toHaveBeenCalled();
    });

    it("should throw when file does not exist", async () => {
      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      await expect(
        engine.readFile("nonexistent.md", {
          toolName: "claude",
          strategyName: "default",
        }),
      ).rejects.toThrow();
    });

    it("should pass engine to pipelines", async () => {
      await fs.writeFile(path.join(tempDir, "source.md"), "content");

      const pipelineFn = vi.fn(async () => ({ content: "piped" }));

      const config: TransmuteConfig = {
        tools: {},
        pipelines: { test: pipelineFn },
      };
      const engine = new Engine(config, tempDir);

      await engine.readFile("source.md", {
        toolName: "claude",
        strategyName: "default",
        pipelines: "test",
      });

      expect(pipelineFn).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: engine,
        }),
      );
    });

    it("should be usable from within a transform", async () => {
      await fs.writeFile(path.join(tempDir, "extra.md"), "Extra Content");
      await fs.writeFile(path.join(tempDir, "input.md"), "Input");

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["**/input.md"],
                transform: async ({ files, engine }) => {
                  const extra = await engine.readFile("extra.md", {
                    toolName: "testTool",
                    strategyName: "test",
                  });
                  return {
                    files: [
                      {
                        path: path.join(tempDir, "output.md"),
                        content: files[0].content + "+" + extra.content,
                      },
                    ],
                  };
                },
              },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      const output = await fs.readFile(
        path.join(tempDir, "output.md"),
        "utf-8",
      );
      expect(output).toBe("Input+Extra Content");
    });

    it("should be usable from within onFinish", async () => {
      await fs.writeFile(path.join(tempDir, "template.md"), "Template Content");
      await fs.writeFile(path.join(tempDir, "input.md"), "Input");

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["**/input.md"],
                transform: () => ({ files: [] }),
              },
            ],
            onFinish: async ({ engine }) => {
              const tpl = await engine.readFile("template.md", {
                toolName: "testTool",
                strategyName: "finalize",
              });
              return {
                files: [
                  {
                    path: path.join(tempDir, "final.md"),
                    content: tpl.content,
                  },
                ],
              };
            },
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      const output = await fs.readFile(path.join(tempDir, "final.md"), "utf-8");
      expect(output).toBe("Template Content");
    });
  });

  describe("readFiles", () => {
    it("should read files matching glob patterns", async () => {
      await fs.writeFile(path.join(tempDir, "a.md"), "A");
      await fs.writeFile(path.join(tempDir, "b.md"), "B");
      await fs.writeFile(path.join(tempDir, "c.txt"), "C");

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const results = await engine.readFiles(["**/*.md"], {
        toolName: "claude",
        strategyName: "default",
      });

      expect(results).toHaveLength(2);
      expect(results.map((f) => f.name).sort()).toEqual(["a.md", "b.md"]);
      expect(results.every((f) => f.extension === ".md")).toBe(true);
      expect(results.every((f) => path.isAbsolute(f.path))).toBe(true);
    });

    it("should read files matching multiple patterns", async () => {
      await fs.writeFile(path.join(tempDir, "a.md"), "A");
      await fs.writeFile(path.join(tempDir, "b.txt"), "B");
      await fs.writeFile(path.join(tempDir, "c.js"), "C");

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const results = await engine.readFiles(["**/*.md", "**/*.txt"], {
        toolName: "claude",
        strategyName: "default",
      });

      expect(results).toHaveLength(2);
      expect(results.map((f) => f.name).sort()).toEqual(["a.md", "b.txt"]);
    });

    it("should apply visibility filters to each file", async () => {
      await fs.writeFile(
        path.join(tempDir, "file.md"),
        `Common<content-factory-filter include="claude">Claude</content-factory-filter>`,
      );

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const claudeResults = await engine.readFiles(["**/*.md"], {
        toolName: "claude",
        strategyName: "default",
      });
      expect(claudeResults[0].content).toBe("CommonClaude");

      const rooResults = await engine.readFiles(["**/*.md"], {
        toolName: "roo",
        strategyName: "default",
      });
      expect(rooResults[0].content).toBe("Common");
    });

    it("should resolve includes in each file", async () => {
      await fs.writeFile(path.join(tempDir, "partial.md"), "Partial");
      await fs.writeFile(
        path.join(tempDir, "main.md"),
        `Main-<content-factory-include-file path="./partial.md" />`,
      );

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const results = await engine.readFiles(["**/main.md"], {
        toolName: "claude",
        strategyName: "default",
      });

      expect(results[0].content).toBe("Main-Partial");
    });

    it("should apply pipelines to each matched file", async () => {
      await fs.writeFile(path.join(tempDir, "a.md"), "hello");
      await fs.writeFile(path.join(tempDir, "b.md"), "world");

      const config: TransmuteConfig = {
        tools: {},
        pipelines: {
          uppercase: async () => ({ content: "UPPERCASED" }),
        },
      };
      const engine = new Engine(config, tempDir);

      const results = await engine.readFiles(["**/*.md"], {
        toolName: "claude",
        strategyName: "default",
        pipelines: "uppercase",
      });

      expect(results).toHaveLength(2);
      expect(results.every((f) => f.content === "UPPERCASED")).toBe(true);
    });

    it("should return empty array when no files match", async () => {
      await fs.writeFile(path.join(tempDir, "file.txt"), "text");

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const results = await engine.readFiles(["**/*.md"], {
        toolName: "claude",
        strategyName: "default",
      });

      expect(results).toHaveLength(0);
    });

    it("should find files in nested directories", async () => {
      const nested = path.join(tempDir, "a", "b");
      await fs.mkdir(nested, { recursive: true });
      await fs.writeFile(path.join(nested, "deep.md"), "Deep");

      const config: TransmuteConfig = { tools: {} };
      const engine = new Engine(config, tempDir);

      const results = await engine.readFiles(["**/*.md"], {
        toolName: "claude",
        strategyName: "default",
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("deep.md");
      expect(results[0].content).toBe("Deep");
      expect(results[0].relativePath).toBe(path.join("a", "b", "deep.md"));
    });

    it("should be usable from within a transform", async () => {
      const extrasDir = path.join(tempDir, "extras");
      await fs.mkdir(extrasDir);
      await fs.writeFile(path.join(extrasDir, "x.md"), "X");
      await fs.writeFile(path.join(extrasDir, "y.md"), "Y");
      await fs.writeFile(path.join(tempDir, "input.md"), "Input");

      const config: TransmuteConfig = {
        tools: {
          testTool: {
            strategies: [
              {
                name: "test",
                matches: ["input.md"],
                transform: async ({ engine }) => {
                  const extras = await engine.readFiles(["extras/**/*.md"], {
                    toolName: "testTool",
                    strategyName: "test",
                  });
                  const combined = extras
                    .map((f) => f.content)
                    .sort()
                    .join("+");
                  return {
                    files: [
                      {
                        path: path.join(tempDir, "output.md"),
                        content: combined,
                      },
                    ],
                  };
                },
              },
            ],
          },
        },
      };

      const engine = new Engine(config, tempDir);
      await engine.run();

      const output = await fs.readFile(
        path.join(tempDir, "output.md"),
        "utf-8",
      );
      expect(output).toBe("X+Y");
    });
  });
});
