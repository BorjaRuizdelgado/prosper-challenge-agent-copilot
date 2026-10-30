import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles/tokens.css";
import "./styles/shell.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AgentsProvider } from "./agents";
import { App } from "./App";
import { RouteError } from "./components/RouteError";
import { ToastProvider } from "./components/Toasts";

// A data router is required for useBlocker (unsaved-changes guard).
const router = createBrowserRouter([
  {
    path: "*",
    errorElement: <RouteError />,
    element: (
      <ToastProvider>
        <AgentsProvider>
          <App />
        </AgentsProvider>
      </ToastProvider>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
