import { Link } from "react-router-dom";
import { AgentList } from "./AgentList";
import { ProductMark } from "./AgentMark";

/** The workspace's front page: every agent, and where to start a new one. */
export function Home() {
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
        </div>
        <AgentList variant="page" />
      </div>
    </div>
  );
}
