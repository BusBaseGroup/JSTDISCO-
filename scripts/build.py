import json
from pathlib import Path

output = Path("dist")
(output / "server").mkdir(parents=True, exist_ok=True)
(output / ".openai").mkdir(exist_ok=True)
assets = {"/" + file.name: file.read_text() for file in sorted(Path("public").iterdir())}
(output / "server/index.js").write_text(
    "const assets = " + json.dumps(assets) + ";\n" + Path("worker/index.js").read_text()
)
(output / ".openai/hosting.json").write_bytes(Path(".openai/hosting.json").read_bytes())
