import axios from "axios";

const client = axios.create();

export interface LocalFilesRootInfo {
  rootDir: string;
  rootName: string;
}

export interface LocalFileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number | null;
  modifiedAt: string | null;
  extension: string | null;
}

export interface LocalFilesListResponse {
  path: string;
  entries: LocalFileEntry[];
}

export interface LocalFilesReadResponse {
  path: string;
  content: string;
}

async function request<T>(method: "get" | "put", action: string, options?: {
  path?: string;
  data?: string;
}) {
  const { data } = await client.request<T>({
    method,
    url: `/local-files/api/${action}`,
    params: options?.path !== undefined ? { path: options.path } : undefined,
    data: options?.data,
    headers: options?.data !== undefined ? { "Content-Type": "application/json" } : undefined,
  });

  return data;
}

export async function getLocalMeshRoot(): Promise<LocalFilesRootInfo> {
  return request<LocalFilesRootInfo>("get", "info");
}

export async function listLocalMeshFiles(path = ""): Promise<LocalFilesListResponse> {
  return request<LocalFilesListResponse>("get", "list", { path });
}

export async function readLocalMeshFile(path: string): Promise<LocalFilesReadResponse> {
  return request<LocalFilesReadResponse>("get", "read", { path });
}

export async function writeLocalMeshFile(path: string, content: string): Promise<void> {
  await request("put", "write", { path, data: content });
}
