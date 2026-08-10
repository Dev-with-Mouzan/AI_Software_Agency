"""Permission policy engine.

Every agent is bound to a workspace (its own sub-directory inside a project).
It may WRITE only inside its workspace; READ access is granted more broadly
(e.g. QA reads backend/frontend source to write tests). All paths are resolved
against the project root and normalized before the check — path traversal is
impossible by construction.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from agency.core.enums import WORKSPACE_MAP

# Access model per agent kind: {"read": [dirs or "*"], "write": [dirs]}.
# Dir names are relative to the project root. "*" means the whole project tree.
# Projects with workspace_mode="free" (adopted existing repos) bypass the write
# subdir list and allow writes anywhere in the root (PROTECTED_FILES still apply).
ACCESS_POLICY: dict[str, dict[str, list[str]]] = {
    "planner": {"read": ["*"], "write": ["docs"]},
    "backend_engineer": {"read": ["*"], "write": ["backend"]},
    "frontend_engineer": {"read": ["*"], "write": ["frontend"]},
    "devops_engineer": {"read": ["*"], "write": ["deployment"]},
    "code_reviewer": {"read": ["*"], "write": ["docs"]},
}

# Tools each agent is allowed to invoke, grouped by category.
# TOOL_POLICY keys/values may reference either a category (below) or a concrete
# tool name; check_tool expands categories to their concrete tool names.
TOOL_POLICY: dict[str, set[str]] = {
    "planner": {"filesystem", "shell", "knowledge_search", "memory", "web"},
    "backend_engineer": {"filesystem", "shell", "knowledge_search", "memory"},
    "frontend_engineer": {"filesystem", "knowledge_search", "memory"},
    "devops_engineer": {"filesystem", "shell", "knowledge_search", "memory"},
    "code_reviewer": {"filesystem", "shell", "knowledge_search", "memory", "web"},
}

# Category -> concrete tool names (must match the tools registered in
# `agency/tools/registry.py`).
CATEGORY_TOOLS: dict[str, set[str]] = {
    "filesystem": {"read_file", "write_file", "list_dir", "make_dir", "delete_file"},
    "shell": {"run_command"},
    "knowledge_search": {"knowledge_search"},
    "memory": {"memory_read", "memory_write"},
    "web": {"web_search", "web_fetch"},
}

# Shell commands that are dangerous and forbidden for every agent.
FORBIDDEN_COMMAND_PREFIXES = (
    "rm -rf /",
    "rm -rf ~",
    "mkfs.",
    "dd ",
    "shutdown",
    "reboot",
    "git push --force",
    "git push -f",
    "DROP DATABASE",
    "DROP TABLE",
    ":(){ :|:& };:",
)

# Dangerous substrings matched anywhere in a command (case-insensitive).
FORBIDDEN_COMMAND_SUBSTRINGS = (
    "rm -rf /",
    "rm -fr /",
    "rm -rf ~",
    "mkfs.",
    "dd if=",
    "shutdown",
    "reboot",
    "halt",
    "poweroff",
    "init 0",
    "git push",
    "chmod 777 /",
    "chown",
    "sudo ",
    "eval ",
    "base64 ",
    "curl ",
    "wget ",
    "nc ",
    "ncat",
    "socat",
    "telnet",
    "openssl s_client",
    "python -c",
    "python3 -c",
    "pip install",  # no network installs from the sandbox
)

# Shell metacharacters that enable chaining or injection. Agents should only run
# a single command (program + arguments); anything that joins or substitutes
# commands is rejected outright.
CHAINING_CHARACTERS = ("&&", "||", ";", "|", "`", "$(", "${", ">", "<")

# Files never readable or writable by any agent (secrets and credentials).
# Blocked by both the path check and the shell tool so a command like
# `cat .env` cannot exfiltrate credentials.
PROTECTED_FILES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.staging",
    "secrets.yaml",
    "secret.yaml",
    "id_rsa",
    "id_rsa.pub",
    ".ssh",
    ".git-credentials",
    ".npmrc",
    ".pypirc",
    "credentials.json",
    "service_account.json",
}


@dataclass(frozen=True)
class PermissionDecision:
    allowed: bool
    reason: str = ""


class PermissionError(Exception):
    """Raised when an agent attempts an action outside its boundaries."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class PermissionPolicy:
    """Stateless resolver of path + tool permissions."""

    def __init__(
        self,
        project_root: Path | str | None = None,
        workspace_mode: str = "structured",
    ) -> None:
        self.project_root = Path(project_root) if project_root else None
        self.workspace_mode = workspace_mode

    # --- path checks -----------------------------------------------------
    def check_path(self, agent_kind: str, path: str, mode: str = "read") -> PermissionDecision:
        if agent_kind not in ACCESS_POLICY:
            return PermissionDecision(False, f"unknown agent kind: {agent_kind}")
        if mode not in {"read", "write"}:
            return PermissionDecision(False, f"invalid mode: {mode}")

        if self.project_root is None:
            # No project context: agents may only touch their global workspace.
            if os.path.isabs(path):
                return PermissionDecision(False, "absolute paths require a project context")
            workspace = WORKSPACE_MAP.get(agent_kind, "")
            if workspace and _is_within(path, workspace):
                return PermissionDecision(True)
            return PermissionDecision(False, f"{agent_kind} may only access ./{workspace}")

        # Resolve candidate path inside the project root.
        try:
            resolved = (self.project_root / path).resolve()
        except (OSError, RuntimeError):
            return PermissionDecision(False, "unresolvable path")
        root = self.project_root.resolve()

        if not _is_within(str(resolved), str(root)):
            return PermissionDecision(False, "path escapes project root")

        rel = resolved.relative_to(root)
        first = rel.parts[0] if rel.parts else ""

        if mode == "write":
            if self.workspace_mode == "free":
                # Adopted existing repo: agents may write anywhere in the project
                # root except protected/secret files.
                if Path(resolved).name.lower() in PROTECTED_FILES:
                    return PermissionDecision(False, f"protected file: {resolved.name}")
                return PermissionDecision(True)
            write_dirs = ACCESS_POLICY[agent_kind]["write"]
            if not write_dirs or (first not in write_dirs and "*" not in write_dirs):
                return PermissionDecision(
                    False, f"{agent_kind} may only write inside: {write_dirs}"
                )
            if Path(resolved).name.lower() in PROTECTED_FILES:
                return PermissionDecision(False, f"protected file: {resolved.name}")
            return PermissionDecision(True)

        read_dirs = ACCESS_POLICY[agent_kind]["read"]
        if "*" in read_dirs or first in read_dirs:
            if Path(resolved).name.lower() in PROTECTED_FILES:
                return PermissionDecision(False, f"protected file: {resolved.name}")
            return PermissionDecision(True)
        return PermissionDecision(False, f"{agent_kind} may only read inside: {read_dirs}")

    # --- tool checks -----------------------------------------------------
    def check_tool(self, agent_kind: str, tool_name: str) -> PermissionDecision:
        allowed = TOOL_POLICY.get(agent_kind, set())
        if tool_name in allowed:
            return PermissionDecision(True)
        # Expand category names (e.g. "filesystem") to concrete tools
        # (e.g. "write_file") so actual tool names resolve correctly.
        for category in allowed:
            if tool_name in CATEGORY_TOOLS.get(category, ()):
                return PermissionDecision(True)
        return PermissionDecision(False, f"tool '{tool_name}' is not allowed for {agent_kind}")

    def check_command(self, agent_kind: str, command: str) -> PermissionDecision:
        lowered = command.strip().lower()
        if not lowered:
            return PermissionDecision(False, "empty command")
        for bad in FORBIDDEN_COMMAND_PREFIXES:
            if lowered.startswith(bad):
                return PermissionDecision(False, f"command rejected by policy: {bad}")
        for bad in FORBIDDEN_COMMAND_SUBSTRINGS:
            if bad in lowered:
                return PermissionDecision(False, f"command rejected by policy: {bad}")
        for ch in CHAINING_CHARACTERS:
            if ch in lowered:
                return PermissionDecision(False, f"command chaining/substitution rejected: {ch}")
        for name in PROTECTED_FILES:
            if name in lowered:
                return PermissionDecision(False, f"protected file in command: {name}")
        return PermissionDecision(True)


def _is_within(path: str, root: str) -> bool:
    try:
        return Path(path).resolve().is_relative_to(Path(root).resolve())
    except OSError:
        return False
