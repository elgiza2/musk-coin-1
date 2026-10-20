// Client-side error reporting hook. Errors from the root error boundary are
// logged here; wire an external service in this function if one is adopted.
export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[app-error]", { route: window.location.pathname, ...context, error });
}
