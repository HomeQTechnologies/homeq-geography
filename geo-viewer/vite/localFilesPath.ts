import path from "path";

export function resolvePathWithinRoot(rootDir: string, relativePath: string): string | null {
  const normalizedRoot = path.resolve(rootDir);
  const resolved = path.resolve(normalizedRoot, relativePath || ".");

  if (resolved === normalizedRoot) {
    return resolved;
  }

  if (!resolved.startsWith(normalizedRoot + path.sep)) {
    return null;
  }

  return resolved;
}

export function toRelativePath(rootDir: string, absolutePath: string): string {
  const normalizedRoot = path.resolve(rootDir);
  const relative = path.relative(normalizedRoot, absolutePath);
  return relative === "" ? "" : relative.split(path.sep).join("/");
}
