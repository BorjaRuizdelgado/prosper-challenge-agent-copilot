import { isRouteErrorResponse, useRouteError } from "react-router-dom";

/** Shown instead of React Router's default error screen when something in the app throws. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <main className="app">
      <div role="alert" className="route-error">
        <h1>Something went wrong</h1>
        <p>The editor hit an unexpected error. Your saved agents are untouched; unsaved edits on this page may be lost.</p>
        <pre className="mono">{message}</pre>
        <p>
          <button type="button" className="primary" onClick={() => window.location.assign("/")}>
            Back to agents
          </button>{" "}
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      </div>
    </main>
  );
}
