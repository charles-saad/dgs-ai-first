import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_module(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


filesystem_server = load_module("filesystem_server", ROOT / ".mcp" / "servers" / "filesystem_server.py")
git_server = load_module("git_server", ROOT / ".mcp" / "servers" / "git_server.py")


print("DOC_READ_START")
print(filesystem_server.read_file("docs/novatech/FAQ-atendimento.md")[:800])
print("DOC_READ_END")
print("SEARCH_START")
print(filesystem_server.search_text("SLA", "data/retrieval-corpus", 3))
print("SEARCH_END")
print("GIT_STATUS_START")
print(git_server.git_status())
print("GIT_STATUS_END")
print("GIT_LOG_START")
print(git_server.git_log(3))
print("GIT_LOG_END")
