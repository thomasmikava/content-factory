import { describe, it, expect } from "vitest";
import { defineConfig, defineTool } from "./config";
import { TransmuteConfig, ToolConfig, IEngine, SourceFile } from "./types";

const mockSourceFile: SourceFile = {
  name: "mock",
  content: "",
  path: "/mock",
  relativePath: "mock",
  extension: ".md",
};

const mockEngine: IEngine = {
  readFile: async () => mockSourceFile,
  readFiles: async () => [mockSourceFile],
};

describe("Config Helpers", () => {
  describe("defineConfig", () => {
    it("should return the same config object", () => {
      const config: TransmuteConfig = {
        tools: {
          claude: {
            strategies: [
              {
                name: "test",
                matches: ["**/*.md"],
                transform: () => ({ files: [] }),
              },
            ],
          },
        },
      };

      const result = defineConfig(config);

      expect(result).toBe(config);
      expect(result).toEqual(config);
    });

    it("should accept config with multiple tools", () => {
      const config: TransmuteConfig = {
        tools: {
          claude: {
            strategies: [],
          },
          roo: {
            strategies: [],
          },
          copilot: {
            strategies: [],
          },
        },
      };

      const result = defineConfig(config);

      expect(Object.keys(result.tools)).toHaveLength(3);
    });

    it("should accept config with onFinish handler", () => {
      const onFinish = () => ({ files: [] });
      const config: TransmuteConfig = {
        tools: {
          test: {
            strategies: [],
            onFinish,
          },
        },
      };

      const result = defineConfig(config);

      expect(result.tools.test.onFinish).toBe(onFinish);
    });

    it("should accept config with async transform", () => {
      const asyncTransform = async () => ({ files: [] });
      const config: TransmuteConfig = {
        tools: {
          test: {
            strategies: [
              {
                name: "async-strategy",
                matches: ["**/*.md"],
                transform: asyncTransform,
              },
            ],
          },
        },
      };

      const result = defineConfig(config);

      expect(result.tools.test.strategies[0].transform).toBe(asyncTransform);
    });
  });

  describe("defineTool", () => {
    it("should return the same tool config object", () => {
      const toolConfig: ToolConfig = {
        strategies: [
          {
            name: "test",
            matches: ["**/*.md"],
            transform: () => ({ files: [] }),
          },
        ],
      };

      const result = defineTool(toolConfig);

      expect(result).toBe(toolConfig);
      expect(result).toEqual(toolConfig);
    });

    it("should accept tool with multiple strategies", () => {
      const toolConfig: ToolConfig = {
        strategies: [
          {
            name: "strategy1",
            matches: ["**/*.md"],
            transform: () => ({ files: [] }),
          },
          {
            name: "strategy2",
            matches: ["**/*.txt"],
            transform: () => ({ files: [] }),
          },
        ],
      };

      const result = defineTool(toolConfig);

      expect(result.strategies).toHaveLength(2);
    });

    it("should accept tool with onFinish handler", () => {
      const onFinish = () => ({
        files: [{ path: "output.txt", content: "test" }],
      });
      const toolConfig: ToolConfig = {
        strategies: [],
        onFinish,
      };

      const result = defineTool(toolConfig);

      expect(result.onFinish).toBe(onFinish);
    });

    it("should accept tool with async onFinish", () => {
      const asyncOnFinish = async () => ({ files: [] });
      const toolConfig: ToolConfig = {
        strategies: [],
        onFinish: asyncOnFinish,
      };

      const result = defineTool(toolConfig);

      expect(result.onFinish).toBe(asyncOnFinish);
    });

    it("should accept tool with onFinish returning deleteFiles", () => {
      const onFinish = () => ({
        files: [],
        deleteFiles: ["dist/**/*.tmp"],
      });
      const toolConfig: ToolConfig = {
        strategies: [],
        onFinish,
      };

      const result = defineTool(toolConfig);

      expect(result.onFinish).toBe(onFinish);
    });

    it("should accept strategy with metadata in transform result", () => {
      const transform = () => ({
        files: [{ path: "out.md", content: "content" }],
        metadata: { processed: true, count: 5 },
      });

      const toolConfig: ToolConfig = {
        strategies: [
          {
            name: "with-metadata",
            matches: ["**/*.md"],
            transform,
          },
        ],
      };

      const result = defineTool(toolConfig);
      const transformResult = result.strategies[0].transform({
        files: [],
        dir: "/test",
        root: "/",
        config: { tools: {} },
        engine: mockEngine,
      });

      expect(transformResult).toHaveProperty("metadata");
    });

    it("should accept strategy with deleteFiles in transform result", () => {
      const transform = () => ({
        files: [],
        deleteFiles: ["dist/**/*.tmp"],
      });

      const toolConfig: ToolConfig = {
        strategies: [
          {
            name: "with-delete",
            matches: ["**/*.md"],
            transform,
          },
        ],
      };

      const result = defineTool(toolConfig);
      const transformResult = result.strategies[0].transform({
        files: [],
        dir: "/test",
        root: "/",
        config: { tools: {} },
        engine: mockEngine,
      });

      expect(transformResult).toHaveProperty("deleteFiles");
    });
  });
});
