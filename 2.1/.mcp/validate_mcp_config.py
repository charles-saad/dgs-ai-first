import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / ".mcp" / "mcp.json"


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_module(module_name: str, script_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Não foi possível carregar o módulo {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ensure_command(command: str) -> None:
    if shutil.which(command) is None:
        raise RuntimeError(f"Comando não encontrado no PATH: {command}")


def validate_filesystem(module) -> None:
    module.configure_runtime([
        "--root",
        str(ROOT),
        "--allowed",
        "src",
        "--allowed",
        "specs",
        "--allowed",
        "skills",
        "--allowed",
        "prompts",
        "--allowed",
        "tests",
        "--allowed",
        "docs/novatech",
        "--allowed",
        "data/retrieval-corpus",
        "--allowed",
        ".mcp",
    ])
    doc = module.read_file("docs/novatech/README.md")
    if "Documentação de negócio" not in doc and "Documentação de negócio da NovaTech" not in doc:
        raise AssertionError("O arquivo de documentação não foi lido corretamente")
    matches = module.search_text("SLA", "data/retrieval-corpus", 1)
    if not matches:
        raise AssertionError("A busca no corpus não retornou resultados")


def validate_git(module) -> None:
    module.configure_runtime(["--repository", str(ROOT)])
    status = module.git_status()
    log = module.git_log(1)
    if not isinstance(status, str):
        raise AssertionError("git_status deve retornar uma string")
    if not isinstance(log, str):
        raise AssertionError("git_log deve retornar uma string")


def validate_memory(module) -> None:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as handle:
        temp_store = Path(handle.name)
    try:
        module.configure_runtime(["--store", str(temp_store)])
        module.write_memory("ci-check", "ok")
        value = module.read_memory("ci-check")
        if value != "ok":
            raise AssertionError("A memória não preservou o valor escrito")
    finally:
        temp_store.unlink(missing_ok=True)


def main() -> None:
    config = load_json(CONFIG_PATH)
    servers = config.get("mcpServers", {})
    required = {"filesystem": ".mcp/servers/filesystem_server.py", "git": ".mcp/servers/git_server.py", "memory": ".mcp/servers/memory_server.py"}
    for name, rel_path in required.items():
        if name not in servers:
            raise AssertionError(f"Servidor MCP ausente na configuração: {name}")
        script_path = ROOT / rel_path
        if not script_path.exists():
            raise FileNotFoundError(f"Script MCP não encontrado: {script_path}")
        command = servers[name].get("command")
        if not command:
            raise AssertionError(f"Servidor {name} sem comando configurado")
        ensure_command(command)

    filesystem_module = load_module("filesystem_server", ROOT / ".mcp" / "servers" / "filesystem_server.py")
    validate_filesystem(filesystem_module)

    git_module = load_module("git_server", ROOT / ".mcp" / "servers" / "git_server.py")
    validate_git(git_module)

    memory_module = load_module("memory_server", ROOT / ".mcp" / "servers" / "memory_server.py")
    validate_memory(memory_module)

    print("MCP configuration validated successfully")


if __name__ == "__main__":
    main()
