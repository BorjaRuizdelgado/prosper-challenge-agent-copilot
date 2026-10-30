import { Outlet } from "react-router-dom";

export function Shell() {
  return (
    <main className="app">
      <Outlet />
    </main>
  );
}
