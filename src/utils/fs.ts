import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import type { Logger } from "./logger";

export async function findFiles(
  patterns: string[],
  cwd: string,
): Promise<string[]> {
  return fg(patterns, {
    cwd,
    absolute: true,
    deep: 10,
    dot: true,
    ignore: ["**/node_modules/**"],
  });
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFiles(
  files: { path: string; content: string }[],
  root: string,
  logger: Logger,
) {
  await Promise.all(
    files.map(async (f) => {
      // Resolve path: if absolute, use as is; if relative, join with root
      const destPath = path.isAbsolute(f.path)
        ? f.path
        : path.resolve(root, f.path);
      logger.log(`[Transmute] Writing file: ${destPath}`);
      await ensureDir(destPath);
      await fs.writeFile(destPath, f.content, "utf-8");
    }),
  );
}

export async function deleteFiles(
  patterns: string[],
  root: string,
  logger: Logger,
) {
  if (!patterns || patterns.length === 0) return;

  const filesToDelete = await fg(patterns, {
    cwd: root,
    absolute: true,
    dot: true,
  });

  if (filesToDelete.length === 0) return;

  logger.log(`[Transmute] Deleting ${filesToDelete.length} files...`);

  await Promise.all(
    filesToDelete.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
        logger.log(`  - Deleted: ${filePath}`);
      } catch (err) {
        logger.error(`  ! Failed to delete: ${filePath}`, err);
      }
    }),
  );
}

export function removePathStartSegments(
  inputPath: string,
  count: number = 1,
): string {
  // 1. Split by regex to capture both '/' and '\'
  //    This ensures safety regardless of the OS origin of the path string.
  const segments = inputPath.split(/[\\/]/);

  // 2. Filter out empty strings (caused by leading slashes or accidental double slashes)
  const cleanSegments = segments.filter((segment) => segment.length > 0);

  // 3. Guard clause: if the path is too short, return empty or handle error
  if (cleanSegments.length <= count) {
    return "";
  }

  // 4. Slice off the first 'count' folders
  const keptSegments = cleanSegments.slice(count);

  // 5. Re-join using the current OS's specific separator so it's valid for the file system
  let result = path.join(...keptSegments);

  // 6. Restore leading slash if the original path had one (optional, based on preference)
  //    This checks if the original input started with either slash type.
  const isAbsolute = inputPath.startsWith("\\") || inputPath.startsWith("/");

  if (isAbsolute) {
    // Prepend the system-specific separator (e.g. '\' on Win, '/' on Linux)
    result = `${path.sep}${result}`;
  }

  return result;
}

/**
 * Replaces a specific segment or sequence of segments within a path.
 * normalization guarantees it works across Windows (\) and POSIX (/) styles.
 */
export function replacePathSegment(
  inputPath: string,
  match: string,
  replacement: string,
): string {
  // 1. Regex to split by both slash types so we treat all inputs uniformly
  const splitRegex = /[\\/]/;

  // 2. Break all inputs into segment arrays, filtering out empty strings
  const inputSegments = inputPath.split(splitRegex).filter((s) => s.length > 0);
  const matchSegments = match.split(splitRegex).filter((s) => s.length > 0);
  const replaceSegments = replacement
    .split(splitRegex)
    .filter((s) => s.length > 0);

  // 3. Find where the match sequence starts in the input array
  let matchIndex = -1;

  // Iterate through input segments looking for the match sequence
  for (let i = 0; i <= inputSegments.length - matchSegments.length; i++) {
    const slice = inputSegments.slice(i, i + matchSegments.length);
    // Compare arrays
    if (slice.every((seg, idx) => seg === matchSegments[idx])) {
      matchIndex = i;
      break; // Stop at the first match
    }
  }

  // 4. If no match is found, return the normalized input path
  if (matchIndex === -1) {
    return path.normalize(inputPath);
  }

  // 5. Construct the new segment array
  const finalSegments = [
    ...inputSegments.slice(0, matchIndex),
    ...replaceSegments,
    ...inputSegments.slice(matchIndex + matchSegments.length),
  ];

  // 6. Re-join using the system's default separator
  let result = path.join(...finalSegments);

  // 7. Restore absolute path prefix if the original input had one
  const isAbsolute = inputPath.startsWith("/") || inputPath.startsWith("\\");

  // On Windows, path.join might not add the leading slash if a drive letter isn't present,
  // so we manually check if we need to prepend the separator.
  if (isAbsolute && !result.startsWith(path.sep)) {
    result = `${path.sep}${result}`;
  }

  return result;
}
