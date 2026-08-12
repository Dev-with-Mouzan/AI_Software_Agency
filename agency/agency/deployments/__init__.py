"""Deployment providers: AWS (S3 + CloudFront) and Vercel."""

from agency.deployments.base import (
    BaseProvider,
    DeploymentError,
    LogFn,
    ProviderContext,
    ProviderDeployResult,
    short_commit,
)
from agency.deployments.compat import ProjectProfile, detect_project
from agency.deployments.registry import (
    ORDER,
    PROVIDERS,
    all_providers,
    configured_providers,
    get_provider,
    profile_for,
    provider_options,
)

__all__ = [
    "ORDER",
    "PROVIDERS",
    "BaseProvider",
    "DeploymentError",
    "LogFn",
    "ProjectProfile",
    "ProviderContext",
    "ProviderDeployResult",
    "all_providers",
    "configured_providers",
    "detect_project",
    "get_provider",
    "profile_for",
    "provider_options",
    "short_commit",
]
