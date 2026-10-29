import { Outlet } from "react-router-dom";

export function Shell() {
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Agents">
        <div className="product-mark">
          <span className="product-mark__glyph" aria-hidden />
          Agent Builder
        </div>
      </aside>
      <main className="sheet">
        <Outlet />
      </main>
    </div>
  );
}
