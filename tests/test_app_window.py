"""Opening the tool as a standalone window instead of a browser tab."""

import sys

from sql_dag_flow import main


def test_candidates_are_listed_for_this_platform():
    candidates = main._chromium_candidates()
    assert isinstance(candidates, list)
    # Nones are allowed (shutil.which misses), strings must look like paths.
    assert all(c is None or isinstance(c, str) for c in candidates)


def test_finding_a_browser_never_raises():
    result = main._find_app_browser()
    assert result is None or isinstance(result, str)


def test_no_browser_means_caller_falls_back(monkeypatch):
    monkeypatch.setattr(main, "_find_app_browser", lambda: None)
    assert main._open_app_window("http://localhost:8000") is False


def test_launch_failure_is_not_fatal(monkeypatch):
    """A browser that refuses to start must degrade to a normal tab, not crash."""
    monkeypatch.setattr(main, "_find_app_browser", lambda: "/nonexistent/browser")

    def boom(*args, **kwargs):
        raise OSError("cannot execute")

    monkeypatch.setattr(main.subprocess, "Popen", boom)
    assert main._open_app_window("http://localhost:8000") is False


def test_app_flag_is_passed_to_the_browser(monkeypatch):
    captured = {}

    monkeypatch.setattr(main, "_find_app_browser", lambda: "/fake/chrome")
    monkeypatch.setattr(main.subprocess, "Popen",
                        lambda cmd, **kw: captured.setdefault("cmd", cmd))

    assert main._open_app_window("http://localhost:1234") is True
    assert captured["cmd"][0] == "/fake/chrome"
    assert "--app=http://localhost:1234" in captured["cmd"]


def test_windows_candidates_use_program_files(monkeypatch):
    if sys.platform != "win32":
        return
    candidates = main._chromium_candidates()
    assert any("chrome.exe" in (c or "") for c in candidates)
    assert any("msedge.exe" in (c or "") for c in candidates)
