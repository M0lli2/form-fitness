"""Render the CC0 MakeHuman athlete using the published human sculpt targets."""
from pathlib import Path
import math
import sys
import bpy
from mathutils import Vector, Quaternion

bpy.ops.wm.read_factory_settings(use_empty=True)
sys.path.insert(0,str(Path("sources/mpfb2-2.0.18/src").resolve()))
import mpfb
mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.locationservice import LocationService

macro = TargetService.get_default_macro_info_dict()
macro.update(gender=1.0, age=.51, muscle=.97, weight=.37, proportions=.67, height=.63)
body = HumanService.create_human(scale=.1, macro_detail_dict=macro)
targets = Path(LocationService.get_mpfb_data("targets"))
features = {"torso/torso-muscle-pectoral-incr":.65,"torso/torso-muscle-dorsi-incr":.48}
for side in "lr":
    features.update({
        f"arms/{side}-upperarm-muscle-incr":.48,
        f"arms/{side}-upperarm-shoulder-muscle-incr":.50,
        f"arms/{side}-lowerarm-muscle-incr":.24,
        f"legs/{side}-upperleg-muscle-incr":.44,
        f"legs/{side}-lowerleg-muscle-incr":.33,
    })
for name, weight in features.items():
    target = targets / f"{name}.target.gz"
    if not target.is_file():
        raise FileNotFoundError(target)
    TargetService.load_target(body,str(target),weight=weight)
rig = HumanService.add_builtin_rig(body, "default")
TargetService.bake_targets(body)
bpy.context.view_layer.objects.active = body
for modifier in list(body.modifiers):
    if modifier.type == "MASK":
        bpy.ops.object.modifier_apply(modifier=modifier.name)
body.name = "Form athlete"
body.data.materials.clear()
bpy.context.view_layer.update()
points = [body.matrix_world @ vertex.co for vertex in body.data.vertices]
ground = min(point.z for point in points)
height = max(point.z for point in points)-ground
assert 1.6 < height < 2.0, height

def smooth(value, start, end):
    t = max(0,min(1,(value-start)/(end-start)))
    return t*t*(3-2*t)

# Per-vertex transition to keep garment and muscle edges smooth in motion.
colors = body.data.color_attributes.new(name="Clay and muscle", type="FLOAT_COLOR", domain="POINT")
ivory = Vector((.61,.58,.55))
charcoal = Vector((.035,.035,.043))
lavender = Vector((.23,.21,.43))
for vertex, p in zip(body.data.vertices,points):
    z = (p.z-ground)/height
    x = abs(p.x)
    back = smooth(p.y,-.009,.040)
    hip = (1-smooth(x,.179,.210))*smooth(z,.45,.463)*(1-smooth(z,.563,.571))
    # Curved leg-opening cut, shaped higher on the outer thigh.
    if p.y < 0:
        opening = .46+.071*smooth(x,.036,.147)
        hip *= smooth(z,opening-.002,opening+.008)
    thigh = (1-back)*smooth(z,.274,.319)*(1-smooth(z,.495,.54))
    thigh *= smooth(x,.026,.072)*(1-smooth(x,.173,.216))
    glute = back * smooth(z,.449,.471)*(1-smooth(z,.547,.561))
    glute *= smooth(x,.009,.042)*(1-smooth(x,.177,.204))
    color = ivory.lerp(charcoal,hip).lerp(lavender,max(thigh*(1-hip),glute*.95))
    colors.data[vertex.index].color = (*color,1)
surface = bpy.data.materials.new("Matte athletic sculpture")
surface.use_nodes = True
nodes = surface.node_tree.nodes
shader = nodes.get("Principled BSDF")
shader.inputs["Roughness"].default_value = .54
attribute = nodes.new("ShaderNodeVertexColor")
attribute.layer_name = colors.name
surface.node_tree.links.new(attribute.outputs["Color"],shader.inputs["Base Color"])
body.data.materials.append(surface)
for face in body.data.polygons:
    face.material_index = 0
    face.use_smooth = True
sub = body.modifiers.new("Sculpt surface", "SUBSURF")
sub.levels = 1
sub.render_levels = 1

scene = bpy.context.scene
center = Vector((0,0,ground+height*.51))
def look_at(obj,point):
    obj.rotation_euler = (point-obj.location).to_track_quat("-Z","Y").to_euler()
scene.world = bpy.data.worlds.new("Studio")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.045,.047,.066,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .33
for position, power, size in (((-1.45,-2.25,3),210,1.5), ((1.6,-1.4,2.3),52,1.7), ((1.1,2.0,2.64),170,1.3)):
    bpy.ops.object.light_add(type="AREA",location=position)
    light = bpy.context.object
    light.data.energy,light.data.size = power,size
    look_at(light,center)
bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = height * 1.16
scene.render.engine = "CYCLES"
scene.cycles.samples = 44
scene.cycles.use_denoising = True
scene.render.resolution_x,scene.render.resolution_y = 620,800
scene.render.resolution_percentage = 100
def shot(name,direction):
    camera.location = center+Vector(direction)
    look_at(camera,center)
    scene.render.filepath = str(Path("evidence", f"athletic-{name}.png").resolve())
    bpy.ops.render.render(write_still=True)

def bend(name,axis,angle):
    bone = rig.pose.bones[name]
    local_axis = bone.bone.matrix_local.to_3x3().inverted() @ Vector(axis)
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = Quaternion(local_axis.normalized(),math.radians(angle))

# Relax the arms for the anatomy screens while leaving wrist and finger weights intact.
for side,sign in (("L",-1),("R",1)):
    bend(f"upperarm01.{side}", (0,1,0), sign*16)
    bend(f"lowerarm01.{side}", (1,0,0),-6)
bpy.context.view_layer.update()
shot("front",(.81,-3.8,.22))
shot("back",(-.76,3.8,.21))

bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath="evidence/form-athletic-review.glb",use_selection=True,
                          export_animations=False)
for side in "LR":
    bend(f"upperleg01.{side}",(1,0,0),-55)
    bend(f"lowerleg01.{side}",(1,0,0),100)
    bend(f"lowerarm01.{side}",(1,0,0),-57)
bpy.context.view_layer.update()
shot("flexion",(1.55,-3.6,.30))
