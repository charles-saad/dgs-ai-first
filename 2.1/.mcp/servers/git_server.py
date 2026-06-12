import argparse
import subprocess
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP


mcp = FastMCP("git")

REPOSITORY = Path(".").resolve()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local git server for novatech-assistant")
    parser.add_argument("--repository", default=".", help="Repository path")
    return parser.parse_args(argv)


def configure_runtime(argv: list[str] | None = None) -> None:
    global REPOSITORY
    args = parse_args(argv)
    REPOSITORY = Path(args.repository).resolve()


configure_runtime([])


def _run_git(*args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=REPOSITORY,
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()


@mcp.tool()
def git_status() -> str:
    return _run_git("status", "--short")


@mcp.tool()
def git_log(max_count: int = 5) -> str:
    return _run_git("log", f"--max-count={max_count}", "--date=short", "--pretty=format:%h|%ad|%s")


@mcp.tool()
def git_branch() -> str:
    return _run_git("branch", "--show-current")


if __name__ == "__main__":
    configure_runtime(sys.argv[1:])
    mcp.run(transport="stdio")
