import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import type { Connect, Plugin } from "vite";
import { resolvePathWithinRoot, toRelativePath } from "./localFilesPath";

export interface LocalFilesPluginOptions {
  meshRootDir: string;
  apiPrefix?: string;
}

export interface LocalFileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number | null;
  modifiedAt: string | null;
  extension: string | null;
}

function sendJson(res: Connect.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readRequestBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readFileAsText(absolutePath: string): string {
  const buffer = fs.readFileSync(absolutePath);
  if (absolutePath.endsWith(".gz")) {
    return gunzipSync(buffer).toString("utf8");
  }
  return buffer.toString("utf8");
}

function listDirectory(rootDir: string, relativePath: string): LocalFileEntry[] {
  const absolutePath = resolvePathWithinRoot(rootDir, relativePath);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    throw new Error("Directory not found.");
  }

  const stats = fs.statSync(absolutePath);
  if (!stats.isDirectory()) {
    throw new Error("Path is not a directory.");
  }

  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map(entry => {
      const entryPath = path.join(absolutePath, entry.name);
      const entryStats = fs.statSync(entryPath);
      const relativeEntryPath = toRelativePath(rootDir, entryPath);
      const extension = entry.isFile() ? path.extname(entry.name).toLowerCase() : null;

      return {
        name: entry.name,
        path: relativeEntryPath,
        kind: entry.isDirectory() ? "directory" : "file",
        size: entry.isFile() ? entryStats.size : null,
        modifiedAt: entryStats.mtime.toISOString(),
        extension,
      } satisfies LocalFileEntry;
    });
}

async function handleStorageAction(
  rootDir: string,
  action: string,
  method: string | undefined,
  relativePath: string,
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
): Promise<boolean> {
  if (action === "info" && method === "GET") {
    sendJson(res, 200, {
      rootDir,
      rootName: path.basename(rootDir),
    });
    return true;
  }

  if (action === "list" && method === "GET") {
    sendJson(res, 200, {
      path: relativePath,
      entries: listDirectory(rootDir, relativePath),
    });
    return true;
  }

  if (action === "read" && method === "GET") {
    const absolutePath = resolvePathWithinRoot(rootDir, relativePath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      sendJson(res, 404, { error: "File not found." });
      return true;
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      sendJson(res, 400, { error: "Path is not a file." });
      return true;
    }

    sendJson(res, 200, {
      path: relativePath,
      content: readFileAsText(absolutePath),
    });
    return true;
  }

  if (action === "write" && method === "PUT") {
    const absolutePath = resolvePathWithinRoot(rootDir, relativePath);
    if (!absolutePath) {
      sendJson(res, 400, { error: "Invalid path." });
      return true;
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const body = await readRequestBody(req);
    fs.writeFileSync(absolutePath, body, "utf8");

    sendJson(res, 200, {
      path: relativePath,
      ok: true,
    });
    return true;
  }

  return false;
}

export function createLocalFilesMiddleware(options: LocalFilesPluginOptions): Connect.NextHandleFunction {
  const meshRootDir = path.resolve(options.meshRootDir);
  const apiPrefix = options.apiPrefix ?? "/local-files/api";

  fs.mkdirSync(meshRootDir, { recursive: true });

  return async (req, res, next) => {
    if (!req.url?.startsWith(apiPrefix)) {
      next();
      return;
    }

    try {
      const url = new URL(req.url, "http://local-files");
      const action = url.pathname.slice(apiPrefix.length).replace(/^\//, "");
      const relativePath = url.searchParams.get("path") ?? "";

      const handled = await handleStorageAction(
        meshRootDir,
        action,
        req.method,
        relativePath,
        req,
        res,
      );

      if (!handled) {
        sendJson(res, 404, { error: "Unknown local files action." });
      }
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Local files request failed.",
      });
    }
  };
}

export function localFilesPlugin(options: LocalFilesPluginOptions): Plugin {
  const middleware = createLocalFilesMiddleware(options);
  const apiPrefix = options.apiPrefix ?? "/local-files/api";

  return {
    name: `local-files:${apiPrefix}`,
    configureServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
