import path from "path";
import { describe, expect, it } from "vitest";
import { resolvePathWithinRoot, toRelativePath } from "../../vite/localFilesPath";

describe("resolvePathWithinRoot", () => {
  const root = path.resolve("/tmp/workspace");

  it("allows paths inside the root", () => {
    expect(resolvePathWithinRoot(root, "meshes/test.mesh.json")).toBe(
      path.resolve(root, "meshes/test.mesh.json"),
    );
  });

  it("blocks path traversal", () => {
    expect(resolvePathWithinRoot(root, "../secrets.txt")).toBeNull();
  });
});

describe("toRelativePath", () => {
  it("returns a posix-style relative path", () => {
    const root = path.resolve("/tmp/workspace");
    expect(toRelativePath(root, path.resolve(root, "meshes/a.json"))).toBe("meshes/a.json");
  });
});
