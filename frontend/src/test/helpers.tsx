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

export const renderApp = (ui: ReactElement, route = "/") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AgentsProvider>{ui}</AgentsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
