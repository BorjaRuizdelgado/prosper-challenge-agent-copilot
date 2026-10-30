import type { ComponentType } from "react";
import { useAgentStore } from "../store";
import { CallPanel } from "./CallPanel";
import { Inspector } from "./Inspector";
import { RunsPanel } from "./RunsPanel";

interface DockTab {
  id: string;
  label: string;
  component: ComponentType;
}

/**
 * The modes of the editor, shown as tabs in the top bar; each one owns the right-hand panel.
 * Settings, issues and the inspector live in Build, the JSON is a canvas view and the copilot has its own panel.
 */
export const DOCK_TABS: DockTab[] = [
  { id: "inspector", label: "Build", component: Inspector },
  { id: "call", label: "Test call", component: CallPanel },
  { id: "runs", label: "Runs", component: RunsPanel },
];

const currentTab = (id: string) => DOCK_TABS.find((t) => t.id === id) ?? DOCK_TABS[0];

export function ModeTabs() {
  const active = useAgentStore((s) => s.dockTab);
  const setDockTab = useAgentStore((s) => s.setDockTab);
  const current = currentTab(active);
  return (
    <div role="tablist" aria-label="Mode" className="mode-tabs">
      {DOCK_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === current.id}
          aria-controls="dock-panel"
          onClick={() => setDockTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Dock() {
  const active = useAgentStore((s) => s.dockTab);
  const current = currentTab(active);
  const Panel = current.component;
  return (
    <aside className="panel dock" aria-label="Dock">
      <div role="tabpanel" id="dock-panel" aria-labelledby={`tab-${current.id}`} className="dock__panel" key={current.id}>
        <Panel />
      </div>
    </aside>
  );
}
