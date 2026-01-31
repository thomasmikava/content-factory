import { describe, it, expect } from "vitest";
import * as index from "./index";
import { Engine } from "./core/engine";
import {
  OutputFile,
  SourceFile,
  TransformContext,
  TransformResult,
  TransformFn,
  OnFinishFn,
  Strategy,
  ToolConfig,
  TransmuteConfig,
} from "./types";

describe("Index Exports", () => {
  it("should export Engine class", () => {
    expect(index.Engine).toBe(Engine);
  });

  it("should export all types", () => {
    // Type assertions to ensure types are exported
    // These are compile-time checks
    const outputFile: OutputFile = { path: "test", content: "test" };
    const sourceFile: SourceFile = {
      name: "test",
      content: "test",
      path: "/test",
      relativePath: "test",
      extension: ".md",
    };
    const transformResult: TransformResult = { files: [] };
    const transformFn: TransformFn = () => ({ files: [] });
    const onFinishFn: OnFinishFn = () => [];
    const strategy: Strategy = {
      name: "test",
      matches: [],
      transform: transformFn,
    };
    const toolConfig: ToolConfig = { strategies: [] };
    const transmuteConfig: TransmuteConfig = { tools: {} };
    const transformContext: TransformContext = {
      files: [],
      dir: "/",
      root: "/",
      config: transmuteConfig,
    };

    // These are runtime checks to ensure the code compiles
    expect(outputFile).toBeDefined();
    expect(sourceFile).toBeDefined();
    expect(transformResult).toBeDefined();
    expect(transformFn).toBeDefined();
    expect(onFinishFn).toBeDefined();
    expect(strategy).toBeDefined();
    expect(toolConfig).toBeDefined();
    expect(transmuteConfig).toBeDefined();
    expect(transformContext).toBeDefined();
  });
});
