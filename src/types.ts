export interface OutputFile {
  path: string;
  content: string;
}

export interface SourceFile {
  name: string;
  content: string; // Pre-processed content
  path: string; // Absolute path
  relativePath: string; // Path relative to root
  extension: string;
}

export interface ReadFileOptions {
  toolName: string;
  strategyName: string;
  pipelines?: string;
}

export interface IEngine {
  readFile(filePath: string, options: ReadFileOptions): Promise<SourceFile>;
  readFiles(
    patterns: string[],
    options: ReadFileOptions,
  ): Promise<SourceFile[]>;
}

export interface TransformContext {
  files: SourceFile[];
  dir: string;
  root: string;
  config: TransmuteConfig;
  engine: IEngine;
}

export interface TransformResult {
  files: OutputFile[];
  deleteFiles?: string[]; // Glob patterns of files to delete
  metadata?: any;
}

export type TransformFn = (
  context: TransformContext,
) => Promise<TransformResult> | TransformResult;

export interface OnFinishResult {
  files?: OutputFile[];
  deleteFiles?: string[]; // Glob patterns of files to delete
}

export type OnFinishFn = (context: {
  metadata: any[];
  engine: IEngine;
}) => Promise<OnFinishResult | void> | OnFinishResult | void;

export interface Strategy {
  name: string;
  matches: string[];
  transform: TransformFn;
}

export interface ToolConfig {
  strategies: Strategy[];
  onFinish?: OnFinishFn;
}

export type PipelineContext = {
  content: string;
  pipelineName: string;
  toolName: string;
  strategyName: string;
  params: string[];
  engine: IEngine;
};

export type PipelineFn = (context: PipelineContext) => Promise<{
  content: string;
}> | void;

export interface TransmuteConfig {
  useLogs?: boolean;
  tools: Record<string, ToolConfig>;
  pipelines?: Record<string, PipelineFn>;
}
