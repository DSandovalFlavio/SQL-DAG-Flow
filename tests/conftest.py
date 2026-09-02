import os
import sys

import pytest

# Make the package importable without requiring an editable install.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


@pytest.fixture
def project(tmp_path):
    """Build a throwaway SQL project from {relative_path: sql_text} and return its root.

    Each test gets its own tmp_path, so the on-disk .sqldagflow cache written
    during parsing never leaks between tests.
    """

    def _make(files):
        for rel, content in files.items():
            path = tmp_path / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        return str(tmp_path)

    return _make


def edge_pairs(edges):
    """(source, target) pairs, for readable assertions."""
    return {(e["source"], e["target"]) for e in edges}


def node_ids(nodes):
    return {n["id"] for n in nodes}
