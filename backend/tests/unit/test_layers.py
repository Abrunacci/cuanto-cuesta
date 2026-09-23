"""Inner layers import only the standard library and the layers below them.

The domain also stays away from the stdlib modules that do I/O.
"""

import ast
import sys
from pathlib import Path

import pytest

import cuanto_cuesta

PACKAGE_DIR = Path(cuanto_cuesta.__file__).parent
IO_STDLIB = {"socket", "http", "urllib", "sqlite3", "asyncio", "subprocess", "os"}


def _imported_modules(path: Path) -> set[str]:
    """Absolute imports by name; a relative import shows up as ``.`` so it is always flagged."""
    modules: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            modules.add(node.module if node.level == 0 and node.module else ".")
    return modules


@pytest.mark.parametrize(
    ("layer", "allowed_layers", "forbidden_stdlib"),
    [
        ("domain", {"domain"}, IO_STDLIB),
        ("application", {"domain", "application"}, set()),
    ],
)
def test_layer_imports_only_stdlib_and_inner_layers(
    layer: str, allowed_layers: set[str], forbidden_stdlib: set[str]
) -> None:
    allowed = tuple(f"cuanto_cuesta.{name}" for name in allowed_layers)
    offending = {
        f"{path.relative_to(PACKAGE_DIR)}: {module}"
        for path in (PACKAGE_DIR / layer).rglob("*.py")
        for module in _imported_modules(path)
        if not module.startswith(allowed)
        and (
            module.split(".")[0] not in sys.stdlib_module_names
            or module.split(".")[0] in forbidden_stdlib
        )
    }
    assert offending == set()
