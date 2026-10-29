import { Route, Routes } from "react-router-dom";
import { AgentEditor } from "./components/AgentEditor";
import { Shell } from "./components/Shell";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<p className="sheet__empty">Select an agent to start.</p>} />
        <Route path="agents/:id" element={<AgentEditor />} />
      </Route>
    </Routes>
  );
}
