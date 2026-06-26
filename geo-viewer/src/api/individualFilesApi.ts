import axios from "axios";

const client = axios.create();

export interface IndividualFilesRootInfo {
  rootDir: string;
  rootName: string;
}

export interface IndividualFileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number | null;
  modifiedAt: string | null;
  extension: string | null;
}

export interface IndividualFilesListResponse {
  path: string;
  entries: IndividualFileEntry[];
}

export interface IndividualFilesReadResponse {
  path: string;
  content: string;
}

async function request<T>(
  method: "get",
  action: string,
  options?: {
    path?: string;
  },
) {
  const { data } = await client.request<T>({
    method,
    url: `/individual-files/api/${action}`,
    params: options?.path !== undefined ? { path: options.path } : undefined,
  });

  return data;
}

export async function getIndividualFilesRoot(): Promise<IndividualFilesRootInfo> {
  return request<IndividualFilesRootInfo>("get", "info");
}

export async function listIndividualFiles(path = ""): Promise<IndividualFilesListResponse> {
  return request<IndividualFilesListResponse>("get", "list", { path });
}

export async function readIndividualFile(path: string): Promise<IndividualFilesReadResponse> {
  return request<IndividualFilesReadResponse>("get", "read", { path });
}
