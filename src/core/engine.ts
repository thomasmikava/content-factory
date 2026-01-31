import path from "path";
import fs from "fs/promises";
import { TransmuteConfig, SourceFile, TransformContext } from "../types";
import { Preprocessor } from "../utils/preprocessor";
import { findFiles, writeFiles } from "../utils/fs";
import { createLogger, type Logger } from "../utils/logger";

export class Engine {
  private config: TransmuteConfig;
  private root: string;
  private logger: Logger;

  constructor(config: TransmuteConfig, root: string) {
    this.config = config;
    this.root = root;
    this.logger = createLogger(config);
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
              rootPath: this.root,
              currentFilePath: fp,
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
          };

          try {
            const result = await strategy.transform(context);

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
          const result = await toolConfig.onFinish({ metadata: toolMetadata });
          if (result && Array.isArray(result)) {
            await writeFiles(result, this.root, this.logger);
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
