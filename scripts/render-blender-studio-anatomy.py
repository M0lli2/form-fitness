"""Render the Blender Studio CC0 realistic male with neutral clay lighting."""
from pathlib import Path
from zipfile import ZipFile
import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
with ZipFile("sources/blender-human.zip") as archive:
    candidates = [n for n in archive.namelist() if n.endswith(".blend") and "__MACOSX" not in n]
    for number, name in enumerate(candidates):
        dest = Path("sources", f"studio-{number}.blend").resolve()
        dest.write_bytes(archive.read(name))
        with bpy.data.libraries.load(str(dest), link=False) as (source, target):
            matches = [n for n in source.objects if n == "GEO-body_male_realistic"]
            target.objects = matches
        if matches:
            body = target.objects[0]
            break
    else:
        raise ValueError(f"Realistic male mesh not found in: {candidates}")

scene = bpy.context.scene
scene.collection.objects.link(body)
body.parent = None
body.location = (0, 0, 0)
for modifier in body.modifiers:
    if modifier.type == "MULTIRES":
        modifier.levels = min(2, modifier.total_levels)
        modifier.render_levels = modifier.levels
body.data.materials.clear()

def material(name, rgb):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb,1)
    shader.inputs["Roughness"].default_value = .56
    return result

body.data.materials.append(material("Ivory clay", (.67,.63,.58)))
body.data.materials.append(material("Charcoal garment", (.035,.035,.042)))
bpy.context.view_layer.update()
points = [body.matrix_world @ vert.co for vert in body.data.vertices]
start = Vector(tuple(min(p[i] for p in points) for i in range(3)))
end = Vector(tuple(max(p[i] for p in points) for i in range(3)))
center = (start + end) / 2
height = end.z - start.z
assert height > 0
for face in body.data.polygons:
    z = ((body.matrix_world @ face.center).z - start.z) / height
    face.material_index = int(.46 <= z <= .57)
    face.use_smooth = True

def aim(obj):
    obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()

scene.world = bpy.data.worlds.new("Studio world")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.055,.058,.082,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .5
for offset, power, size in (((-1.3,-2.5,1.75),420,2.4), ((2,-1,1.1),120,1.7), ((1,2,1.5),280,2.0)):
    bpy.ops.object.light_add(type="AREA", location=center + Vector(offset) * height)
    lamp = bpy.context.object
    lamp.data.energy = power * height**2
    lamp.data.size = size * height
    aim(lamp)

bpy.ops.object.camera_add()
cam = bpy.context.object
cam.data.type = "ORTHO"
cam.data.ortho_scale = height * 1.16
scene.camera = cam
scene.render.engine = "CYCLES"
scene.cycles.samples = 36
scene.cycles.use_denoising = True
scene.render.resolution_x = 630
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
for name, direction in (("front", (.78,-2.6,.20)), ("back",(-.72,2.6,.20))):
    cam.location = center + height * Vector(direction)
    aim(cam)
    scene.render.filepath = str(Path("evidence",f"studio-{name}.png").resolve())
    bpy.ops.render.render(write_still=True)
Path("evidence/studio-mesh.txt").write_text(
    f"{body.name}\nBounds: {tuple(start)} to {tuple(end)}\nBase vertices: {len(body.data.vertices)}\n",
    encoding="utf-8",
)
