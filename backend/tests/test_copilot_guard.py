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
