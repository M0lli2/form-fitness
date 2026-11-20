"""Validate and inspect the two upstream GLB files without running their scene content."""
from collections import Counter
import json
from pathlib import Path
import struct

summary = {}
for path in sorted(Path("sources").glob("*.glb")):
    with path.open("rb") as source:
        magic, version, length, json_length, tag = struct.unpack("<4sIIII", source.read(20))
        if magic != b"glTF" or version != 2 or tag != 0x4e4f534a or length != path.stat().st_size:
            raise ValueError(f"Invalid glTF binary container: {path.name}")
        data = json.loads(source.read(json_length))
    nodes = data.get("nodes", [])
    meshes = data.get("meshes", [])
    accessors = data.get("accessors", [])
    skins = data.get("skins", [])
    triangles = sum(
        accessors[primitive["indices"]]["count"] // 3 for mesh in meshes for primitive in mesh["primitives"]
        if primitive.get("mode", 4) == 4 and "indices" in primitive
    )
    result = {
        "mesh_count": len(meshes), "indexed_triangles": triangles,
        "skin_joint_counts": [len(skin["joints"]) for skin in skins],
        "joint_names": [nodes[i].get("name") for skin in skins for i in skin["joints"]],
        "metadata_fields": dict(Counter(key for node in nodes for key in node.get("extras", {}))),
        "example_meshes": [node.get("name", "") for node in nodes if "mesh" in node][:25],
        "extensions": data.get("extensionsUsed", []),
    }
    summary[path.name] = result
Path("evidence/geometry.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
