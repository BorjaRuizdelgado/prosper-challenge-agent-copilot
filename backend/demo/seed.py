"""Write the demo agents into the agents directory. Run: python -m demo.seed (or `make demo`)."""

import json
from pathlib import Path

from api import store

DEMO_AGENTS_DIR = Path(__file__).resolve().parent / "agents"


def seed() -> list[str]:
    """Write each demo agent under its file stem, replacing any agent with that id.

    An agent with a `<id>.guidelines.md` beside its JSON also gets those guidelines, reset on
    every seed. Other agents are left alone. Returns the ids written.
    """
    ids = []
    for source in sorted(DEMO_AGENTS_DIR.glob("*.json")):
        agent_id = store.validate_agent_id(source.stem)
        store._write_atomic(store.agent_path(agent_id), json.loads(source.read_text()))
        guidelines = source.with_suffix(".guidelines.md")
        if guidelines.exists():
            store.save_guidelines(agent_id, guidelines.read_text())
        else:
            store.guidelines_path(agent_id).unlink(missing_ok=True)
        ids.append(agent_id)
    return ids


if __name__ == "__main__":
    for agent_id in seed():
        print(f"Seeded {agent_id} into {store.agents_dir()}")
