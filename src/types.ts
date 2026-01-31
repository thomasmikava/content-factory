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

export interface TransformContext {
  files: SourceFile[];
  dir: string;
  root: string;
  config: TransmuteConfig;
}

export interface TransformResult {
  files: OutputFile[];
  metadata?: any;
}

export type TransformFn = (
  context: TransformContext,
) => Promise<TransformResult> | TransformResult;

export type OnFinishFn = (context: {
  metadata: any[];
}) => Promise<OutputFile[]> | OutputFile[] | void;

export interface Strategy {
  name: string;
  matches: string[];
  transform: TransformFn;
}

export interface ToolConfig {
  strategies: Strategy[];
  onFinish?: OnFinishFn;
}

export interface TransmuteConfig {
  useLogs?: boolean;
  tools: Record<string, ToolConfig>;
}
