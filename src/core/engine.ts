import path from "path";
import fs from "fs/promises";
import {
  TransmuteConfig,
  SourceFile,
  TransformContext,
  ReadFileOptions,
  IEngine,
} from "../types";
import { Preprocessor } from "../utils/preprocessor";
import { deleteFiles, findFiles, writeFiles } from "../utils/fs";
import { createLogger, type Logger } from "../utils/logger";

export class Engine implements IEngine {
  private config: TransmuteConfig;
  private root: string;
  private logger: Logger;

  constructor(config: TransmuteConfig, root: string) {
    this.config = config;
    this.root = root;
    this.logger = createLogger(config);
  }

  /**
   * Reads a single file, applying preprocessing (visibility filters, includes)
   * and optional pipelines.
   *
   * Path resolution:
   * - Absolute paths (starts with /): used as-is
   * - Root-relative paths (starts with @/): resolved from project root
   * - Relative paths: resolved from project root
   */
  async readFile(
    filePath: string,
    options: ReadFileOptions,
  ): Promise<SourceFile> {
    const resolvedPath = this.resolveFilePath(filePath);

    const rawContent = await fs.readFile(resolvedPath, "utf-8");

    let processedContent = await Preprocessor.process({
      content: rawContent,
      toolName: options.toolName,
      strategyName: options.strategyName,
      pipelines: this.config.pipelines,
      rootPath: this.root,
      currentFilePath: resolvedPath,
      engine: this,
    });

    // Apply pipelines if specified
    if (options.pipelines && this.config.pipelines) {
      processedContent = await Preprocessor.executePipelines(
        processedContent,
        options.pipelines,
        this.config.pipelines,
        options.toolName,
        options.strategyName,
        this,
      );
    }

    return {
      name: path.basename(resolvedPath),
      content: processedContent,
      path: resolvedPath,
      relativePath: path.relative(this.root, resolvedPath),
      extension: path.extname(resolvedPath),
    };
  }

  /**
   * Reads multiple files matching glob patterns, applying preprocessing
   * (visibility filters, includes) and optional pipelines to each.
   */
  async readFiles(
    patterns: string[],
    options: ReadFileOptions,
  ): Promise<SourceFile[]> {
    const filePaths = await findFiles(patterns, this.root);
    const sourceFiles: SourceFile[] = [];

    for (const fp of filePaths) {
      const rawContent = await fs.readFile(fp, "utf-8");

      let processedContent = await Preprocessor.process({
        content: rawContent,
        toolName: options.toolName,
        strategyName: options.strategyName,
        pipelines: this.config.pipelines,
        rootPath: this.root,
        currentFilePath: fp,
        engine: this,
      });

      // Apply pipelines if specified
      if (options.pipelines && this.config.pipelines) {
        processedContent = await Preprocessor.executePipelines(
          processedContent,
          options.pipelines,
          this.config.pipelines,
          options.toolName,
          options.strategyName,
          this,
        );
      }

      sourceFiles.push({
        name: path.basename(fp),
        content: processedContent,
        path: fp,
        relativePath: path.relative(this.root, fp),
        extension: path.extname(fp),
      });
    }

    return sourceFiles;
  }

  /**
   * Resolves a file path for readFile/readFiles.
   * - Absolute: used as-is
   * - @/ prefix: resolved from project root
   * - Relative: resolved from project root
   */
  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    if (filePath.startsWith("@/")) {
      return path.resolve(this.root, filePath.slice(2));
    }
    return path.resolve(this.root, filePath);
  }

  async run() {
    this.logger.log(`[Transmute] Starting engine at ${this.root}...`);

    // Iterate Tools
    for (const [toolName, toolConfig] of Object.entries(this.config.tools)) {
      this.logger.log(`[Transmute] Processing tool: ${toolName}`);

      const toolMetadata: any[] = [];

      // Iterate Strategies
      for (const strategy of toolConfig.strategies) {
        this.logger.log(`  > Strategy: ${strategy.name} (${toolName})`);

        // Discovery
        const rawFilePaths = await findFiles(strategy.matches, this.root);

        // Group files by directory
        const dirGroups = new Map<string, string[]>();
        for (const fp of rawFilePaths) {
          const dir = path.dirname(fp);
          if (!dirGroups.has(dir)) dirGroups.set(dir, []);
          dirGroups.get(dir)!.push(fp);
        }

        // Process per directory (Batch)
        for (const [dir, filePaths] of dirGroups.entries()) {
          const sourceFiles: SourceFile[] = [];

          // Read and Preprocess
          for (const fp of filePaths) {
            const rawContent = await fs.readFile(fp, "utf-8");
            const processedContent = await Preprocessor.process({
              content: rawContent,
              toolName: toolName,
              strategyName: strategy.name,
              pipelines: this.config.pipelines,
              rootPath: this.root,
              currentFilePath: fp,
              engine: this,
            });

            sourceFiles.push({
              name: path.basename(fp),
              path: fp,
              relativePath: path.relative(this.root, fp),
              extension: path.extname(fp),
              content: processedContent,
            });
          }

          // Execute Transform
          const context: TransformContext = {
            files: sourceFiles,
            dir: dir,
            root: this.root,
            config: this.config,
            engine: this,
          };

          try {
            const result = await strategy.transform(context);

            // Delete Files
            if (result.deleteFiles && result.deleteFiles.length > 0) {
              await deleteFiles(result.deleteFiles, this.root, this.logger);
            }

            // Write Output
            if (result.files && result.files.length > 0) {
              await writeFiles(result.files, this.root, this.logger);
            }

            // Collect Metadata
            if (result.metadata) {
              toolMetadata.push(result.metadata);
            }
          } catch (err) {
            this.logger.error(
              `[Transmute] Error in strategy '${strategy.name}' at dir '${dir}':`,
              err,
            );
          }
        }
      }

      // Run onFinish for the tool
      if (toolConfig.onFinish) {
        this.logger.log(`  > Finalizing ${toolName}...`);
        try {
          const result = await toolConfig.onFinish({
            metadata: toolMetadata,
            engine: this,
          });
          if (result) {
            if (result.deleteFiles && Array.isArray(result.deleteFiles)) {
              await deleteFiles(result.deleteFiles, this.root, this.logger);
            }
            if (result.files && Array.isArray(result.files)) {
              await writeFiles(result.files, this.root, this.logger);
            }
          }
        } catch (err) {
          this.logger.error(
            `[Transmute] Error in onFinish for tool '${toolName}':`,
            err,
          );
        }
      }
    }

    this.logger.log("[Transmute] Done.");
  }
}
