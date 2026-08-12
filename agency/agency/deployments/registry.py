"""Deployment provider registry + option resolution."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from agency.deployments.aws import aws_provider
from agency.deployments.compat import ProjectProfile, detect_project
from agency.deployments.vercel import vercel_provider

PROVIDERS: dict[str, Any] = {
    aws_provider.name: aws_provider,
    vercel_provider.name: vercel_provider,
}

ORDER = ["vercel", "aws"]


def get_provider(name: str) -> Any | None:
    return PROVIDERS.get(name)


def all_providers() -> list[Any]:
    return [PROVIDERS[name] for name in ORDER if name in PROVIDERS]


def configured_providers() -> list[Any]:
    return [p for p in all_providers() if p.is_configured()]


def profile_for(root: Path) -> ProjectProfile:
    return detect_project(root)


def provider_options(profile: ProjectProfile) -> list[dict]:
    """Compatibility-driven provider list for the Deploy modal.

    Every provider is returned (so the UI can explain why a target is not
    offered), but only compatible ones are actionable.
    """
    options: list[dict] = []
    for provider in all_providers():
        compatible, reason = provider.compatible(profile)
        missing = provider.config_status()
        options.append(
            {
                "name": provider.name,
                "label": provider.label,
                "configured": provider.is_configured(),
                "missing": missing,
                "compatible": compatible,
                "reason": reason,
                "profile": profile.description,
                "project_type": profile.project_type,
                "technology_stack": profile.tech_stack,
            }
        )
    return options
