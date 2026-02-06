# content-factory

A build tool for generating multiple output files from a single source of truth. Define your content once, then filter and transform it for different targets.

## The Problem

You have content that needs to exist in multiple places with slight variations. For example:

- AI coding assistant rules for Claude, Copilot, and Roo (each with different capabilities)
- Documentation for different platforms
- Config files for different environments

Maintaining these separately leads to drift and duplication. **content-factory** lets you write once and generate targeted outputs.

## Quick Start

**1. Create a config file (`content-factory.config.js`):**

```js
const { defineConfig } = require("content-factory");

module.exports = defineConfig({
  useLogs: true,
  tools: {
    claude: {
      strategies: [
        {
          name: "rules",
          matches: ["src/rules/**/*.md"],
          transform: ({ files }) => ({
            files: files.map((f) => ({
              path: `dist/claude/${f.name}`,
              content: f.content,
            })),
          }),
        },
      ],
    },
    copilot: {
      strategies: [
        {
          name: "rules",
          matches: ["src/rules/**/*.md"],
          transform: ({ files }) => ({
            files: files.map((f) => ({
              path: `dist/copilot/${f.name}`,
              content: f.content,
            })),
          }),
        },
      ],
    },
  },
});
```

**2. Write your source content (`src/rules/coding.md`):**

```md
# Coding Rules

Always write clean, readable code.

<content-factory-filter include="claude">
Use XML tags for structured output.
</content-factory-filter>

<content-factory-filter include="copilot">
Use markdown code blocks for examples.
</content-factory-filter>

<content-factory-filter exclude="copilot">
You can use multi-file editing.
</content-factory-filter>
```

**3. Run:**

```bash
npx content-factory
```

This generates `dist/claude/coding.md` and `dist/copilot/coding.md` with tool-specific content.

## Features

### Conditional Content

Use `<content-factory-filter>` to include/exclude content per tool:

```md
<content-factory-filter include="claude,roo">
Only in Claude and Roo outputs.
</content-factory-filter>

<content-factory-filter exclude="copilot">
In all outputs except Copilot.
</content-factory-filter>
```

Filters can be nested.

### File Includes

Use `<content-factory-include-file>` to compose content from multiple files:

```md
# Main Document

<content-factory-include-file path="./intro.md" />
<content-factory-include-file path="@/shared/footer.md" />
```

**Path resolution:**

- `./relative.md` — relative to current file
- `@/from-root.md` — relative to project root
- `/absolute/path.md` — absolute path

Included files are recursively processed (filters and includes apply). Circular dependencies are detected and throw an error.

### Pipelines

Pipelines allow you to transform the content of an included file before it's inserted. This is useful for things like adjusting heading levels, removing specific lines, or wrapping content.

1. **Define pipelines in your config:**

```js
module.exports = defineConfig({
  // ...
  pipelines: {
    "adjust-headings": ({ params, content }) => {
      const level = parseInt(params[0] || "1", 10);
      const prefix = "#".repeat(level);
      // Note: use engine.readFile() if you need to pull in additional content
      return {
        content: content.replace(/^(#+)/gm, (match) => match + prefix),
      };
    },
    "inject-header": async ({ content, engine, toolName, strategyName }) => {
      const header = await engine.readFile("@/shared/header.md", {
        toolName,
        strategyName,
      });
      return {
        content: header.content + "\n" + content,
      };
    },
  },
});
```

2. **Use pipelines in your include tags:**

```md
<content-factory-include-file path="./section.md" pipelines="adjust-headings(2), wrap-example" />
```

Pipelines are executed in order (left to right). Arguments are passed as strings. Each pipeline receives an `engine` instance for reading additional files.

### Programmatic File Reading

The `engine` instance is available in `transform`, `onFinish`, and `pipelines`. It provides two methods for reading files with full preprocessing (visibility filters, includes, and optional pipelines):

#### `engine.readFile(path, options)` — Read a Single File

Returns a `SourceFile` with preprocessed content.

```js
transform: async ({ files, engine }) => {
  // Relative to project root
  const header = await engine.readFile("src/shared/header.md", {
    toolName: "claude",
    strategyName: "rules",
  });

  // Root-relative (@/ syntax)
  const footer = await engine.readFile("@/shared/footer.md", {
    toolName: "claude",
    strategyName: "rules",
  });

  // With pipelines applied after preprocessing
  const section = await engine.readFile("src/section.md", {
    toolName: "claude",
    strategyName: "rules",
    pipelines: "adjust-headings(2), wrap-example",
  });

  return {
    files: [
      {
        path: "dist/output.md",
        content:
          header.content + "\n" + section.content + "\n" + footer.content,
      },
    ],
  };
};
```

**Path resolution for `readFile`:**

- `src/file.md` — relative to project root
- `@/shared/file.md` — relative to project root (explicit)
- `/absolute/path.md` — absolute path

#### `engine.readFiles(patterns, options)` — Read Multiple Files via Glob

Returns `SourceFile[]` with preprocessed content for all matched files.

```js
transform: async ({ engine }) => {
  const extras = await engine.readFiles(["src/extras/**/*.md"], {
    toolName: "claude",
    strategyName: "rules",
  });

  // With pipelines applied to every matched file
  const sections = await engine.readFiles(["src/sections/**/*.md"], {
    toolName: "claude",
    strategyName: "rules",
    pipelines: "adjust-headings(1)",
  });

  return {
    files: extras.map((f) => ({
      path: `dist/claude/${f.name}`,
      content: f.content,
    })),
  };
};
```

#### `SourceFile` Shape

Both methods return objects with this shape:

```ts
interface SourceFile {
  name: string; // e.g. "coding.md"
  content: string; // Preprocessed content
  path: string; // Absolute path
  relativePath: string; // Path relative to project root
  extension: string; // e.g. ".md"
}
```

#### Standalone Usage (Outside `engine.run`)

You can also use `readFile` and `readFiles` without running the full build:

```js
const { Engine, defineConfig } = require("content-factory");

const config = defineConfig({
  tools: {
    /* ... */
  },
  pipelines: {
    /* ... */
  },
});
const engine = new Engine(config, process.cwd());

const file = await engine.readFile("src/rules/coding.md", {
  toolName: "claude",
  strategyName: "rules",
  pipelines: "uppercase",
});
console.log(file.content);
```

### Transform Functions

Each strategy's `transform` function receives processed files and an `engine` instance:

```js
transform: ({ files, dir, root, config, engine }) => {
  return {
    files: [{ path: "output.md", content: "..." }],
    metadata: {
      /* passed to onFinish */
    },
    // Optional: Glob patterns of files to delete
    deleteFiles: ["dist/**/*.tmp"],
  };
};
```

### onFinish Hook

Run logic after all strategies complete for a tool. Also receives the `engine` instance:

```js
{
  strategies: [...],
  onFinish: async ({ metadata, engine }) => {
    const index = await engine.readFile("@/templates/index.md", {
      toolName: "claude",
      strategyName: "finalize",
    });

    return {
      files: [{ path: "dist/index.md", content: index.content }],
      deleteFiles: ["dist/temp/**/*"]
    };
  }
}
```

## CLI

```bash
# Use default config (content-factory.config.js)
npx content-factory

# Use custom config
npx content-factory --config my-config.js
```

## API

```js
const { Engine, defineConfig, defineTool } = require("content-factory");

const config = defineConfig({
  tools: {
    /* ... */
  },
});
const engine = new Engine(config, process.cwd());
await engine.run();
```

## License

MIT
