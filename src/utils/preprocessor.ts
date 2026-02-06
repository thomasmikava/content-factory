import fs from "fs/promises";
import path from "path";
import { IEngine, PipelineFn } from "../types";

interface PreprocessOptions {
  content: string;
  toolName: string;
  strategyName: string;
  pipelines?: Record<string, PipelineFn>;
  rootPath: string;
  currentFilePath: string;
  visitedFiles?: Set<string>;
  engine?: IEngine;
}

export class Preprocessor {
  /**
   * Main entry point to process a file's content.
   * Handles both visibility filtering and file includes with recursion and cycle detection.
   */
  static async process(options: PreprocessOptions): Promise<string> {
    const visitedFiles = options.visitedFiles ?? new Set<string>();
    const normalizedCurrentPath = path.resolve(options.currentFilePath);

    // Check for circular dependency
    if (visitedFiles.has(normalizedCurrentPath)) {
      throw new Error(
        `[Transmute] Circular dependency detected: ${normalizedCurrentPath} is already being processed.\nInclude chain: ${Array.from(visitedFiles).join(" -> ")} -> ${normalizedCurrentPath}`,
      );
    }

    // Add current file to visited set
    visitedFiles.add(normalizedCurrentPath);

    let text = options.content;

    // 1. First, process visibility (content-factory-filter tags)
    //    This removes content not meant for the current tool
    text = this.processVisibility(text, options.toolName);

    // 2. Then, process file includes (content-factory-include-file tags)
    //    This resolves file references in the remaining content
    text = await this.processIncludes(text, {
      toolName: options.toolName,
      strategyName: options.strategyName,
      pipelines: options.pipelines,
      rootPath: options.rootPath,
      currentFilePath: normalizedCurrentPath,
      visitedFiles: visitedFiles,
      engine: options.engine,
    });

    // Remove current file from visited set (allows the same file to be included in different branches)
    visitedFiles.delete(normalizedCurrentPath);

    return text;
  }

  /**
   * Process <content-factory-include-file path="..." /> tags.
   * Recursively processes included files.
   */
  private static async processIncludes(
    text: string,
    options: {
      toolName: string;
      strategyName: string;
      pipelines?: Record<string, PipelineFn>;
      rootPath: string;
      currentFilePath: string;
      visitedFiles: Set<string>;
      engine?: IEngine;
    },
  ): Promise<string> {
    // Regex to match <content-factory-include-file path="..." pipelines="..." />
    // Path is always first, pipelines is optional.
    const includeRegex =
      /<content-factory-include-file\s+path\s*=\s*["']([^"']+)["'](?:\s+pipelines\s*=\s*["']([^"']+)["'])?\s*(?:\/>|><\/content-factory-include-file>)/g;

    // Find all matches first to process them
    const matches: Array<{
      fullMatch: string;
      filePath: string;
      pipelinesStr?: string;
    }> = [];
    let match;

    while ((match = includeRegex.exec(text)) !== null) {
      matches.push({
        fullMatch: match[0],
        filePath: match[1],
        pipelinesStr: match[2],
      });
    }

    // Process each match
    for (const { fullMatch, filePath, pipelinesStr } of matches) {
      const resolvedPath = this.resolvePath(
        filePath,
        options.rootPath,
        options.currentFilePath,
      );

      let includedContent: string;

      try {
        includedContent = await fs.readFile(resolvedPath, "utf-8");
      } catch (error) {
        console.error(
          `[Transmute] Failed to include file '${filePath}' (resolved to '${resolvedPath}')`,
        );
        includedContent = `[MISSING FILE: ${filePath}]`;
        text = text.replace(fullMatch, includedContent);
        continue;
      }

      // Recursively process the included file
      let processedContent = await this.process({
        content: includedContent,
        toolName: options.toolName,
        strategyName: options.strategyName,
        pipelines: options.pipelines,
        rootPath: options.rootPath,
        currentFilePath: resolvedPath,
        visitedFiles: options.visitedFiles,
        engine: options.engine,
      });

      // Execute pipelines if present
      if (pipelinesStr && options.pipelines) {
        processedContent = await this.executePipelines(
          processedContent,
          pipelinesStr,
          options.pipelines,
          options.toolName,
          options.strategyName,
          options.engine,
        );
      }

      text = text.replace(fullMatch, processedContent);
    }

    return text;
  }

  /**
   * Parses and executes a chain of pipelines on the content.
   */
  static async executePipelines(
    content: string,
    pipelinesStr: string,
    availablePipelines: Record<string, PipelineFn>,
    toolName: string,
    strategyName: string,
    engine?: IEngine,
  ): Promise<string> {
    const pipelinesToRun = this.parsePipelineString(pipelinesStr);
    let currentContent = content;

    for (const { name, params } of pipelinesToRun) {
      const pipelineFn = availablePipelines[name];
      if (!pipelineFn) {
        console.warn(`[Transmute] Warning: Pipeline '${name}' not found.`);
        continue;
      }

      try {
        const result = await pipelineFn({
          content,
          pipelineName: name,
          toolName,
          strategyName,
          params,
          engine: engine as IEngine,
        });

        // If pipeline returns void, it's skipped (content remains unchanged)
        // If it returns an object with content, update the content
        if (result && typeof result.content === "string") {
          currentContent = result.content;
        }
      } catch (error) {
        console.error(`[Transmute] Error executing pipeline '${name}':`, error);
        // On error, we might want to keep the content as is or throw.
        // For now, let's keep going and log the error.
      }
    }

    return currentContent;
  }

  /**
   * Parses a pipeline string like "remove-nth-line(5,true),add-line"
   * into [{ name: "remove-nth-line", params: ["5", "true"] }, { name: "add-line", params: [] }]
   */
  static parsePipelineString(
    input: string,
  ): Array<{ name: string; params: string[] }> {
    const result: Array<{ name: string; params: string[] }> = [];
    let current = "";
    let depth = 0;

    const pushCurrent = () => {
      const trimmed = current.trim();
      if (!trimmed) return;

      // Check for params in parentheses
      const parenStart = trimmed.indexOf("(");
      if (parenStart !== -1 && trimmed.endsWith(")")) {
        const name = trimmed.substring(0, parenStart).trim();
        const paramsStr = trimmed.substring(parenStart + 1, trimmed.length - 1);
        // Split params by comma, handling potential commas in quotes (though simple CSV for now)
        // For now assuming simple params without commas inside them
        const params = paramsStr
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
        result.push({ name, params });
      } else {
        result.push({ name: trimmed, params: [] });
      }
      current = "";
    };

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (char === "(") depth++;
      else if (char === ")") depth--;

      if (char === "," && depth === 0) {
        pushCurrent();
      } else {
        current += char;
      }
    }
    pushCurrent();

    return result;
  }

  /**
   * Resolves a file path that can be:
   * - Absolute (starts with /)
   * - Root-relative (starts with @/)
   * - Relative to current file (starts with ./ or ../ or just a name)
   */
  static resolvePath(
    filePath: string,
    rootPath: string,
    currentFilePath: string,
  ): string {
    // Absolute path
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Root-relative path (starts with @/)
    if (filePath.startsWith("@/")) {
      return path.resolve(rootPath, filePath.slice(2));
    }

    // Relative path (relative to current file's directory)
    const currentDir = path.dirname(currentFilePath);
    return path.resolve(currentDir, filePath);
  }

  /**
   * Handles <content-factory-filter> tags, including nesting.
   * Uses a stack-based approach or recursive string scanning instead of Regex
   * to strictly handle nested tags.
   */
  private static processVisibility(text: string, currentTool: string): string {
    const TAG_NAME = "content-factory-filter";
    const TAG_OPEN_START = `<${TAG_NAME}`;
    const TAG_CLOSE = `</${TAG_NAME}>`;

    // Find the first opening tag
    const startIndex = text.indexOf(TAG_OPEN_START);
    if (startIndex === -1) return text;

    // Find the matching closing tag to handle nesting
    let depth = 0;
    let cursor = startIndex;
    let closingIndex = -1;

    while (cursor < text.length) {
      const nextOpen = text.indexOf(TAG_OPEN_START, cursor);
      const nextClose = text.indexOf(TAG_CLOSE, cursor);

      if (nextClose === -1) {
        break;
      }

      // Check if we found a nested open tag before the close tag
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        cursor = nextOpen + TAG_OPEN_START.length;
      } else {
        depth--;
        cursor = nextClose + TAG_CLOSE.length;
        if (depth === 0) {
          closingIndex = nextClose;
          break;
        }
      }
    }

    if (closingIndex === -1) {
      console.warn(`[Transmute] Warning: Unclosed <${TAG_NAME}> tag found.`);
      return text;
    }

    // Extract the opening tag string to parse attributes
    const openingTagEnd = text.indexOf(">", startIndex);
    const openingTagStr = text.substring(startIndex, openingTagEnd + 1);

    // Robust regex to allow spaces around '=' (e.g. include = "roo")
    const includeMatch = openingTagStr.match(/include\s*=\s*["']([^"']+)["']/);
    const excludeMatch = openingTagStr.match(/exclude\s*=\s*["']([^"']+)["']/);

    const includes = includeMatch
      ? includeMatch[1].split(",").map((s) => s.trim())
      : [];
    const excludes = excludeMatch
      ? excludeMatch[1].split(",").map((s) => s.trim())
      : [];

    // If 'include' is missing, default to true. If present, tool must be listed.
    const isIncluded = includes.length === 0 || includes.includes(currentTool);
    const isExcluded = excludes.includes(currentTool);

    const shouldKeep = isIncluded && !isExcluded;

    // Process Inner Content
    const innerContentRaw = text.substring(openingTagEnd + 1, closingIndex);
    let replacement = "";

    if (shouldKeep) {
      replacement = this.processVisibility(innerContentRaw, currentTool);
    }

    // Process Remaining Text
    const remainingText = text.substring(closingIndex + TAG_CLOSE.length);
    const processedRemaining = this.processVisibility(
      remainingText,
      currentTool,
    );

    return text.substring(0, startIndex) + replacement + processedRemaining;
  }
}
