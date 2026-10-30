import { Link } from "react-router-dom";
import { AgentList } from "./AgentList";
import { ProductMark } from "./AgentMark";
import { useAgents } from "../agents";

/** The workspace's front page: every agent, and where to start a new one. */
export function Home() {
  const { state } = useAgents();
  const agents = state.status === "ready" ? state.agents : [];
  return (
    <div className="home">
      <header className="topbar">
        <Link to="/" className="topbar__home" aria-label="Prosper home">
          <ProductMark />
        </Link>
      </header>
      <div className="home__sheet">
        <div className="home__intro">
          <h1 className="home__title">Voice agents</h1>
          <p className="home__lede">
            Each agent answers your front desk's calls as a graph of steps. Select an agent to open its graph, or start a new one and
            describe it to the copilot.
          </p>
          {agents.length > 0 && (
            <dl className="home__stats">
              <div className="home__stat">
                <dd>{agents.length}</dd>
                <dt>{agents.length === 1 ? "agent" : "agents"}</dt>
              </div>
              <div className="home__stat">
                <dd>{agents.reduce((n, a) => n + a.node_count, 0)}</dd>
                <dt>steps in total</dt>
              </div>
            </dl>
          )}
        </div>
        <AgentList variant="page" />
      </div>
    </div>
  );
}
