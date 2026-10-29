import { Outlet } from "react-router-dom";
import { AgentList } from "./AgentList";

export function Shell() {
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Agents">
        <div className="product-mark">
          <span className="product-mark__glyph" aria-hidden />
          Agent Builder
        </div>
        <AgentList />
      </aside>
      <main className="sheet">
        <Outlet />
      </main>
    </div>
  );
}
