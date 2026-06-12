import argparse
import json
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP


mcp = FastMCP("memory")

STORE = Path(".mcp/memory.json").resolve()
DATA: dict[str, str] = {}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local memory server for novatech-assistant")
    parser.add_argument("--store", default=".mcp/memory.json", help="Path to the JSON memory store")
    return parser.parse_args(argv)


def configure_runtime(argv: list[str] | None = None) -> None:
    global STORE, DATA
    args = parse_args(argv)
    STORE = Path(args.store).resolve()
    STORE.parent.mkdir(parents=True, exist_ok=True)
    if STORE.exists() and STORE.stat().st_size > 0:
        try:
            DATA = json.loads(STORE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            DATA = {}
    else:
        DATA = {}


configure_runtime([])


@mcp.tool()
def read_memory(key: str | None = None) -> str:
    if key is None:
        return json.dumps(DATA, ensure_ascii=False, indent=2)
    return str(DATA.get(key, ""))


@mcp.tool()
def write_memory(key: str, value: str) -> str:
    DATA[key] = value
    STORE.write_text(json.dumps(DATA, ensure_ascii=False, indent=2), encoding="utf-8")
    return f"Stored {key}"


if __name__ == "__main__":
    configure_runtime(sys.argv[1:])
    mcp.run(transport="stdio")
