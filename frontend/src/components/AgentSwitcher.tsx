import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AgentList } from "./AgentList";

/** The open agent's name opens this menu: every agent, with new, rename, duplicate and delete. */
export function AgentSwitcher() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // A dialog opened from the menu handles its own Escape; the menu closes only when none is open.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog]") && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="switcher" ref={root}>
      <button
        type="button"
        className="ghost switcher__toggle"
        aria-label="Switch agent"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="m5 6.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="switcher__menu">
          <div className="switcher__head">
            <span>Agents</span>
            <Link to="/" onClick={() => setOpen(false)}>
              View all
            </Link>
          </div>
          <AgentList variant="menu" onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
