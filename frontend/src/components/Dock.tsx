import type { ComponentType } from "react";
import { useAgentStore } from "../store";
import { CallPanel } from "./CallPanel";
import { CopilotPanel } from "./CopilotPanel";
import { Inspector } from "./Inspector";
import { JsonPanel } from "./JsonPanel";
import { IssuesPanel } from "./IssuesPanel";
import { SettingsForm } from "./SettingsForm";

interface DockTab {
  id: string;
  label: string;
  component: ComponentType;
}

/** Register a component here to add a dock tab (JSON, Issues, Call, Copilot…). */
export const DOCK_TABS: DockTab[] = [{ id: "inspector", label: "Inspector", component: Inspector },
  { id: "issues", label: "Issues", component: IssuesPanel },
  { id: "json", label: "JSON", component: JsonPanel },
  { id: "settings", label: "Settings", component: SettingsForm },
  { id: "call", label: "Call", component: CallPanel },
  { id: "copilot", label: "Copilot", component: CopilotPanel },
];

export function Dock() {
  const active = useAgentStore((s) => s.dockTab);
  const setDockTab = useAgentStore((s) => s.setDockTab);
  const current = DOCK_TABS.find((t) => t.id === active) ?? DOCK_TABS[0];
  const Panel = current.component;
  return (
    <aside className="dock" aria-label="Dock">
      <div role="tablist" className="dock__tabs">
        {DOCK_TABS.map((t) => (
          <button
            key={t.id}
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
      <div role="tabpanel" id="dock-panel" aria-labelledby={`tab-${current.id}`} className="dock__panel">
        <Panel />
      </div>
    </aside>
  );
}
