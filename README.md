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

### Transform Functions

Each strategy's `transform` function receives processed files and returns output:

```js
transform: ({ files, dir, root, config }) => {
  return {
    files: [{ path: "output.md", content: "..." }],
    metadata: {
      /* passed to onFinish */
    },
  };
};
```

### onFinish Hook

Run logic after all strategies complete for a tool:

```js
{
  strategies: [...],
  onFinish: ({ metadata }) => {
    // Generate index, combine outputs, etc.
    return [{ path: "dist/index.md", content: "..." }];
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
