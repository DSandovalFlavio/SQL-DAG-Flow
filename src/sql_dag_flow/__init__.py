"""SQL DAG Flow — static data lineage for local .sql files."""

try:  # Python 3.8+
    from importlib.metadata import PackageNotFoundError, version as _pkg_version
except ImportError:  # pragma: no cover - Python 3.7 fallback
    from importlib_metadata import PackageNotFoundError, version as _pkg_version

try:
    # Read the version from the installed package metadata rather than hardcoding
    # it, so it can never drift from pyproject.toml.
    __version__ = _pkg_version("sql-dag-flow")
except PackageNotFoundError:  # running from a source checkout without install
    __version__ = "0.0.0+dev"

__all__ = ["__version__"]
