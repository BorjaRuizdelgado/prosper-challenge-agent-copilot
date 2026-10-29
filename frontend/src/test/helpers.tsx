import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AgentsProvider } from "../agents";
import { ToastProvider } from "../components/Toasts";

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Stub fetch with queued responses; an Error rejects like a network failure. */
export function mockFetch(...responses: Array<Response | Error>) {
  const fn = vi.fn();
  responses.forEach((r) =>
    r instanceof Error ? fn.mockRejectedValueOnce(r) : fn.mockResolvedValueOnce(r),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Stub fetch by route ("GET /api/agents", ...); unmatched requests fail the test loudly. */
export function mockApi(routes: Record<string, () => Response>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? "GET"} ${url}`];
    if (!handler) throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    return handler();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export const renderApp = (ui: ReactElement, route = "/") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AgentsProvider>{ui}</AgentsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
