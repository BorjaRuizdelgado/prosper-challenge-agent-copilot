import pytest

from copilot import workspace
from copilot.guard import check_path


@pytest.fixture
def ws(tmp_path, monkeypatch):
    monkeypatch.setenv("COPILOT_WORKSPACE", str(tmp_path))
    workspace.write_draft("clinic", {})
    workspace.write_draft("other", {})
    workspace.skill_dir().mkdir(parents=True)
    (workspace.skill_dir() / "SKILL.md").write_text("skill")
    workspace.skill_dir(workspace.RUN_REVIEW_SKILL_NAME).mkdir()
    (workspace.skill_dir(workspace.RUN_REVIEW_SKILL_NAME) / "SKILL.md").write_text("review")
    (tmp_path.parent / "secret.json").write_text("{}")
    return tmp_path


def allowed(tool, path):
    return check_path(tool, str(path), "clinic")[0]


@pytest.mark.parametrize("tool", ["Read", "Edit", "Write"])
def test_own_draft_is_allowed(ws, tool):
    assert allowed(tool, ws / "drafts" / "clinic.json")


def test_relative_paths_resolve_against_the_workspace(ws):
    assert allowed("Edit", "drafts/clinic.json")
    assert allowed("Read", "./drafts/../drafts/clinic.json")
    assert not allowed("Edit", "drafts/other.json")


def test_skill_files_are_read_only(ws):
    skill = workspace.skill_dir() / "SKILL.md"
    assert allowed("Read", skill)
    assert not allowed("Edit", skill)
    assert not allowed("Write", workspace.skill_dir() / "new.md")


def test_the_run_review_skill_is_read_only_too(ws):
    skill = workspace.skill_dir(workspace.RUN_REVIEW_SKILL_NAME) / "SKILL.md"
    assert allowed("Read", skill)
    assert not allowed("Edit", skill)
    assert not allowed("Write", skill)


@pytest.mark.parametrize("tool", ["Read", "Edit", "Write"])
def test_another_agents_draft_is_denied(ws, tool):
    assert not allowed(tool, ws / "drafts" / "other.json")


@pytest.mark.parametrize(
    "path",
    ["../agents/x.json", "drafts/../../secret.json", "/etc/passwd", "/tmp/anything", "drafts", "", "."],
)
def test_everything_else_is_denied(ws, path):
    assert not allowed("Read", path)
    assert not allowed("Write", path)


def test_absolute_path_outside_the_workspace_is_denied(ws):
    assert not allowed("Read", ws.parent / "secret.json")


def test_symlink_out_of_the_workspace_is_denied(ws):
    link = workspace.skill_dir() / "escape.json"
    link.symlink_to(ws.parent / "secret.json")
    assert not allowed("Read", link)
    draft_link = ws / "drafts" / "linked.json"
    draft_link.symlink_to(ws.parent / "secret.json")
    assert not check_path("Edit", str(draft_link), "linked")[0]


def test_symlinked_draft_pointing_elsewhere_is_denied(ws):
    # The agent's own draft path swapped for a link to another file.
    target = ws / "drafts" / "other.json"
    own = ws / "drafts" / "clinic.json"
    own.unlink()
    own.symlink_to(target)
    assert not allowed("Edit", own)


@pytest.mark.parametrize("tool", ["Bash", "WebFetch", "Glob", "read"])
def test_other_tools_are_denied(ws, tool):
    allowed_, reason = check_path(tool, str(ws / "drafts" / "clinic.json"), "clinic")
    assert not allowed_ and tool in reason


def test_denial_gives_a_reason(ws):
    ok, reason = check_path("Read", "/etc/passwd", "clinic")
    assert not ok and "clinic.json" in reason


@pytest.fixture
def runs(ws):
    for agent in ("clinic", "other"):
        path = workspace.runs_path(agent)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("runs")
    return workspace.runs_dir()


def test_own_runs_file_is_read_only(runs):
    assert allowed("Read", runs / "clinic.txt")
    assert allowed("Read", "runs/clinic.txt")
    assert not allowed("Edit", runs / "clinic.txt")
    assert not allowed("Write", "runs/clinic.txt")


@pytest.mark.parametrize("tool", ["Read", "Edit", "Write"])
def test_another_agents_runs_are_denied(runs, tool):
    assert not allowed(tool, runs / "other.txt")
    assert not allowed(tool, "runs/other.txt")


@pytest.mark.parametrize("path", ["runs", "runs/new.txt", "runs/../runs/other.txt", "drafts/../runs/other.txt"])
def test_the_rest_of_the_runs_directory_is_denied(runs, path):
    assert not allowed("Read", path)


def test_runs_path_variants_resolve_to_the_real_file(runs):
    assert allowed("Read", "drafts/../runs/clinic.txt")
    assert allowed("Read", "./runs/./clinic.txt")


def test_symlinks_cannot_reach_another_agents_runs(runs, ws):
    (runs / "link.txt").symlink_to(runs / "other.txt")
    assert not allowed("Read", runs / "link.txt")
    (ws / "alias").symlink_to(runs / "other.txt")
    assert not allowed("Read", ws / "alias")


def test_a_symlinked_own_runs_file_to_elsewhere_is_denied(ws):
    workspace.runs_dir().mkdir(parents=True, exist_ok=True)
    (workspace.runs_dir() / "clinic.txt").symlink_to(ws.parent / "secret.json")
    # The directory is resolved, the file is not followed: a swapped-in link resolves outside and fails.
    assert not allowed("Read", workspace.runs_dir() / "clinic.txt")


@pytest.fixture
def guidelines(ws):
    for agent in ("clinic", "other"):
        path = workspace.guidelines_path(agent)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("guidelines")
    return workspace.guidelines_dir()


def test_own_guidelines_are_read_only(guidelines):
    assert allowed("Read", guidelines / "clinic.md")
    assert allowed("Read", "guidelines/clinic.md")
    assert not allowed("Edit", guidelines / "clinic.md")
    assert not allowed("Write", "guidelines/clinic.md")


@pytest.mark.parametrize("tool", ["Read", "Edit", "Write"])
def test_another_agents_guidelines_are_denied(guidelines, tool):
    assert not allowed(tool, guidelines / "other.md")
    assert not allowed(tool, "guidelines/other.md")


@pytest.mark.parametrize("path", ["guidelines", "guidelines/new.md", "guidelines/../guidelines/other.md", "drafts/../guidelines/other.md"])
def test_the_rest_of_the_guidelines_directory_is_denied(guidelines, path):
    assert not allowed("Read", path)


def test_guidelines_path_variants_resolve_to_the_real_file(guidelines):
    assert allowed("Read", "drafts/../guidelines/clinic.md")
    assert allowed("Read", "./guidelines/./clinic.md")


def test_symlinks_cannot_reach_another_agents_guidelines(guidelines, ws):
    (guidelines / "link.md").symlink_to(guidelines / "other.md")
    assert not allowed("Read", guidelines / "link.md")
    (ws / "alias").symlink_to(guidelines / "other.md")
    assert not allowed("Read", ws / "alias")


def test_a_symlinked_own_guidelines_file_to_elsewhere_is_denied(ws):
    workspace.guidelines_dir().mkdir(parents=True, exist_ok=True)
    (workspace.guidelines_dir() / "clinic.md").symlink_to(ws.parent / "secret.json")
    assert not allowed("Read", workspace.guidelines_dir() / "clinic.md")
