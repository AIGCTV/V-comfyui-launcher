"""Read-only compatibility probe, executed by the ComfyUI Python selected in VLauncher."""
from __future__ import annotations

import asyncio
import importlib.util
import inspect
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
mode, comfy_root, *node_paths = sys.argv[1:]
sys.argv = [sys.argv[0], "--cpu"]
sys.path.insert(0, str(Path(comfy_root).resolve()))
if sys.version_info < (3, 10):
    raise RuntimeError("Python 3.10 or newer is required")

from comfy_api.latest import ComfyExtension, io

if not hasattr(io, "ComfyNode") or not hasattr(io, "Schema"):
    raise RuntimeError("The selected ComfyUI lacks the required V3 node API")
if "has_intermediate_output" not in inspect.signature(io.Schema).parameters:
    raise RuntimeError("ComfyUI V3 Schema is missing has_intermediate_output, required by PS Bridge. Update ComfyUI manually before installing these nodes.")

if mode == "nodes":
    root = Path(node_paths[0]).resolve()
    spec = importlib.util.spec_from_file_location("vlauncher_ps_bridge_probe", root / "__init__.py", submodule_search_locations=[str(root)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    async def check():
        extension = await module.comfy_entrypoint()
        if not isinstance(extension, ComfyExtension):
            raise RuntimeError("Invalid ComfyUI extension")
        nodes = await extension.get_node_list()
        expected = {"VP_Image", "VP_SendToPS", "VP_Seed", "VP_Slider", "VP_Prompt", "VP_Batch"}
        actual = {node.define_schema().node_id for node in nodes}
        if actual != expected or len(nodes) != 6:
            raise RuntimeError(f"Unexpected node catalog: {sorted(actual)}")
        return sorted(actual)

    print(json.dumps({"ok": True, "nodes": asyncio.run(check())}, ensure_ascii=False))
elif mode == "environment":
    print(json.dumps({"ok": True, "python": sys.version.split()[0], "v3": True}))
else:
    raise RuntimeError("Unknown probe mode")
