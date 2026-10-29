import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles/tokens.css";
import "./styles/shell.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AgentsProvider } from "./agents";
import { App } from "./App";
import { ToastProvider } from "./components/Toasts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AgentsProvider>
          <App />
        </AgentsProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
