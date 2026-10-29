import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// React Flow measures its container; jsdom has no layout engine.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Assigned directly (not vi.stubGlobal) so tests calling vi.unstubAllGlobals() keep them.
globalThis.ResizeObserver = ResizeObserverStub;
globalThis.DOMMatrixReadOnly = class { m22 = 1 } as unknown as typeof DOMMatrixReadOnly;
