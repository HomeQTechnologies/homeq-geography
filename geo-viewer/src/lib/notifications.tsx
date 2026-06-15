import { toast } from "@/components/ui";

export function notifyError(error?: string | { title: string; description?: string }, timeout = 5000) {
  const label = !error ? "Something went wrong" : typeof error === "string" ? error : error.title;
  const description = typeof error === "object" && error.description ? error.description : undefined;

  toast.error(label, { description, duration: timeout });
}

export function notifySuccess(message: string, timeout = 5000) {
  toast.success(message, { duration: timeout });
}

export function notifyInfo(args: { message: string; timeout?: number; description?: string }) {
  const { message, timeout = 5000, description } = args;

  toast.info(message, { description, duration: timeout });
}
