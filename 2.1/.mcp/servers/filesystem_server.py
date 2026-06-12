import argparse
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP


mcp = FastMCP("filesystem")

ROOT = Path(".").resolve()
ALLOWED_DIRS: list[Path] = []
READ_ONLY_DIRS: list[Path] = []


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MCP filesystem server for novatech-assistant")
    parser.add_argument("--root", default=".", help="Repository root")
    parser.add_argument(
        "--allowed",
        action="append",
        default=[],
        help="Allowed directory to access (can be used multiple times)",
    )
    return parser.parse_args(argv)


def configure_runtime(argv: list[str] | None = None) -> None:
    global ROOT, ALLOWED_DIRS, READ_ONLY_DIRS
    args = parse_args(argv)
    ROOT = Path(args.root).resolve()
    ALLOWED_DIRS = [ROOT / p for p in args.allowed] if args.allowed else [
        ROOT / "src",
        ROOT / "specs",
        ROOT / "skills",
        ROOT / "prompts",
        ROOT / "tests",
        ROOT / "docs" / "novatech",
        ROOT / "data" / "retrieval-corpus",
        ROOT / ".mcp",
    ]
    READ_ONLY_DIRS = [ROOT / "docs" / "novatech", ROOT / "data" / "retrieval-corpus"]


configure_runtime([])


def _resolve_path(raw_path: str) -> Path:
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    candidate = candidate.resolve()
    if not str(candidate).startswith(str(ROOT)):
        raise ValueError("Path escapes repository root")
    if not any(candidate.is_relative_to(allowed_dir) for allowed_dir in ALLOWED_DIRS):
        raise ValueError("Path is outside the allowed MCP scope")
    return candidate


def _ensure_writable(path: Path) -> None:
    if any(path.is_relative_to(readonly_dir) for readonly_dir in READ_ONLY_DIRS):
        raise PermissionError("This path is read-only for MCP")


@mcp.tool()
def list_directory(path: str) -> list[str]:
    resolved = _resolve_path(path)
    return [item.name for item in sorted(resolved.iterdir())]


@mcp.tool()
def read_file(path: str) -> str:
    resolved = _resolve_path(path)
    if not resolved.is_file():
        raise FileNotFoundError(f"File not found: {resolved}")
    return resolved.read_text(encoding="utf-8")


@mcp.tool()
def search_text(query: str, path: str | None = None, max_results: int = 5) -> list[dict[str, str]]:
    base = _resolve_path(path or ".") if path else ROOT
    if not base.exists():
        raise FileNotFoundError(f"Path not found: {base}")
    matches: list[dict[str, str]] = []
    for file_path in base.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in {".md", ".txt", ".json", ".ts", ".tsx", ".py"}:
            continue
        try:
            text = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if query.lower() in text.lower():
            snippet = text.splitlines()[0][:180]
            matches.append({"path": str(file_path.relative_to(ROOT)), "snippet": snippet})
            if len(matches) >= max_results:
                break
    return matches


@mcp.tool()
def write_file(path: str, content: str) -> str:
    resolved = _resolve_path(path)
    _ensure_writable(resolved)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(content, encoding="utf-8")
    return f"Wrote {resolved.relative_to(ROOT)}"


if __name__ == "__main__":
    configure_runtime(sys.argv[1:])
    mcp.run(transport="stdio")
