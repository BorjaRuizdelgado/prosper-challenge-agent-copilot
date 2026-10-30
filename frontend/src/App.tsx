import { Route, Routes } from "react-router-dom";
import { AgentEditor } from "./components/AgentEditor";
import { Home } from "./components/Home";
import { Shell } from "./components/Shell";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="agents/:id" element={<AgentEditor />} />
      </Route>
    </Routes>
  );
}
