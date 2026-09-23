"""The domain must stay pure: only the standard library and itself."""

import ast
import sys
from pathlib import Path

import cuanto_cuesta.domain

DOMAIN_DIR = Path(cuanto_cuesta.domain.__file__).parent
ALLOWED_PREFIX = "cuanto_cuesta.domain"
FORBIDDEN_STDLIB = {"socket", "http", "urllib", "sqlite3", "asyncio", "subprocess", "os"}


def _imported_modules(path: Path) -> set[str]:
    modules: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            modules.add(node.module)
    return modules


def test_domain_imports_only_stdlib_and_itself() -> None:
    offending = {
        f"{path.name}: {module}"
        for path in DOMAIN_DIR.glob("*.py")
        for module in _imported_modules(path)
        if not module.startswith(ALLOWED_PREFIX)
        and (
            module.split(".")[0] not in sys.stdlib_module_names
            or module.split(".")[0] in FORBIDDEN_STDLIB
        )
    }
    assert offending == set()
