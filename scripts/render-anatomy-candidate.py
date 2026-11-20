"""Preview the CC0 source with Form's clay lighting and inspect it in a bent pose."""
import bpy
from mathutils import Vector, Quaternion
from math import radians
from pathlib import Path
import json

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path("sources/rigged.glb").resolve()))
scene = bpy.context.scene
bpy.context.view_layer.update()
meshes = [obj for obj in scene.objects if obj.type == "MESH"
          and any(mod.type == "ARMATURE" for mod in obj.modifiers)]
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
def world_bounds(objects):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for original in objects:
        obj = original.evaluated_get(graph)
        points.extend(obj.matrix_world @ Vector(p) for p in obj.bound_box)
    return points

# The asset's high-poly named auxiliary surface spans only part of the face.
span_by_object = {}
for obj in meshes:
    bounds = world_bounds([obj])
    span_by_object[obj] = max(point.z for point in bounds) - min(point.z for point in bounds)
    print("RIGGED MESH", obj.name, "world height", span_by_object[obj])
full_body = max(meshes, key=span_by_object.get)
for obj in meshes:
    obj.hide_render = obj != full_body
meshes = [full_body]
corners = world_bounds(meshes)
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
        point = obj.matrix_world @ face.center
        z = point.z
        # A solid modesty material for the neutral presentation preview.
        face.material_index = int(abs(point.x - cx) <= .14 * height
                                  and z0 + height * .455 <= z <= z0 + height * .57)
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
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.resolution_x = 560
scene.render.resolution_y = 730
scene.render.resolution_percentage = 100

def shot(name, position):
    camera.location = position
    aim(camera, (cx,cy,z0+height*.52))
    bpy.context.view_layer.update()
    print("FRAMING", name, "pivot", (cx,cy,z0+height*.52), "height", height,
          "camera", tuple(camera.location), "resolution", scene.render.resolution_x, scene.render.resolution_y)
    scene.render.filepath = str(Path("evidence", name + ".png").resolve())
    bpy.ops.render.render(write_still=True)

shot("rigged-front", (cx+1.15,cy-4,z0+height*.64))
shot("rigged-back", (cx-1.05,cy+4,z0+height*.64))
# Capture the named armature for the release integration pass. Keep neutral if no remap is confirmed.
Path("evidence/blender-rig.txt").write_text("\n".join(b.name for b in rig.data.bones), encoding="utf-8")

# Bend the source rig's knees and elbows to examine skin deformation.
for side in ("L", "R"):
    for name, angle in ((f"upperleg01.{side}", -60), (f"lowerleg01.{side}", 105), (f"lowerarm01.{side}", -40)):
        joint = rig.pose.bones[name]
        axis = joint.bone.matrix_local.to_3x3().inverted() @ Vector((1,0,0))
        joint.rotation_mode = "QUATERNION"
        joint.rotation_quaternion = Quaternion(axis.normalized(), radians(angle))
bpy.context.view_layer.update()
shot("rigged-flexion", (cx+2,cy-4,z0+height*.67))

# Compare separately authored superficial muscles.
old = [obj for obj in scene.objects if obj.type == "MESH"]
for obj in old:
    obj.hide_render = True
bpy.ops.import_scene.gltf(filepath=str(Path("sources/ecorche.glb").resolve()))
source = [obj for obj in scene.objects if obj.type == "MESH" and obj not in old]
with Path("sources/ecorche.glb").open("rb") as glb:
    glb.seek(12)
    json_size = int.from_bytes(glb.read(4), "little")
    glb.read(4)
    nodes = json.loads(glb.read(json_size))["nodes"]
superficial_names = {n["name"] for n in nodes
                     if "mesh" in n and n.get("extras", {}).get("layer","").startswith("superficial")}
visible = [obj for obj in source if obj.name in superficial_names
           or str(obj.get("layer", "")).startswith("superficial")]
if len(visible) < 20:
    raise RuntimeError("Could not identify the superficial muscle layer")
purple = material("Target muscle", (.25,.22,.43))
for obj in source:
    obj.hide_render = obj not in visible
    if not obj.hide_render:
        obj.data.materials.clear()
        obj.data.materials.append(purple if any(word in obj.name.lower() for word in ("vastus","rectus femoris","gluteus maximus")) else ivory)
        for face in obj.data.polygons:
            face.use_smooth = True
            face.material_index = 0
bpy.context.view_layer.update()
bounds = world_bounds(visible)
cx = (min(p.x for p in bounds)+max(p.x for p in bounds))/2
cy = (min(p.y for p in bounds)+max(p.y for p in bounds))/2
z0 = min(p.z for p in bounds)
height = max(p.z for p in bounds)-z0
camera.data.ortho_scale = height*1.18
shot("ecorche-front", (cx+.75*height,cy-2.25*height,z0+height*.65))
shot("ecorche-back", (cx-.70*height,cy+2.2*height,z0+height*.65))
