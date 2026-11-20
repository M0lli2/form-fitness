"""Preview the CC0 source with Form's clay lighting and inspect it in a bent pose."""
import bpy
from mathutils import Vector
from math import radians
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path("sources/rigged.glb").resolve()))
scene = bpy.context.scene
meshes = [obj for obj in scene.objects if obj.type == "MESH"]
rig = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
if not meshes or not rig:
    raise RuntimeError("Expected a rigged surface")

def material(name, color):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = .56
    return result

ivory = material("Warm ivory", (.69, .64, .58))
charcoal = material("Charcoal", (.036, .036, .044))
corners = [obj.matrix_world @ Vector(p) for obj in meshes for p in obj.bound_box]
z0 = min(p.z for p in corners)
z1 = max(p.z for p in corners)
height = z1 - z0
cx = (max(p.x for p in corners) + min(p.x for p in corners)) / 2
cy = (max(p.y for p in corners) + min(p.y for p in corners)) / 2
for obj in meshes:
    obj.data.materials.clear()
    obj.data.materials.append(ivory)
    obj.data.materials.append(charcoal)
    for face in obj.data.polygons:
        z = (obj.matrix_world @ face.center).z
        # A solid modesty material for the neutral presentation preview.
        face.material_index = int(z0 + height * .455 <= z <= z0 + height * .608)
        face.use_smooth = True

def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()

def area(name, pos, power, size):
    bpy.ops.object.light_add(type="AREA", location=pos)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = size
    aim(light, (cx,cy,z0+.55*height))

scene.world = bpy.data.worlds.new("Studio")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.055,.058,.083,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .50
area("Key", (-2,-3,4), 410, 2.6)
area("Fill", (2,-1,2.4), 130, 2.0)
area("Rim", (1,2.5,3.2), 270, 2.1)
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = height * 1.19
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.resolution_x = 560
scene.render.resolution_y = 730
scene.render.resolution_percentage = 100

def shot(name, position):
    camera.location = position
    aim(camera, (cx,cy,z0+height*.52))
    scene.render.filepath = str(Path("evidence", name + ".png").resolve())
    bpy.ops.render.render(write_still=True)

shot("rigged-front", (cx+1.15,cy-4,z0+height*.64))
shot("rigged-back", (cx-1.05,cy+4,z0+height*.64))
# Capture the named armature for the release integration pass. Keep neutral if no remap is confirmed.
Path("evidence/blender-rig.txt").write_text("\n".join(b.name for b in rig.data.bones), encoding="utf-8")
