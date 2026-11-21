"""Transfer atlas-derived muscle contours to the posed, continuous display surface."""
import json
from collections import defaultdict
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree
import bpy

REGIONS = {
    "chest": ("pectoralis major",),
    "abs": ("rectus abdominis",),
    "obliques": ("external oblique", "serratus anterior"),
    "delts": ("deltoid",),
    "traps": ("trapezius",),
    "lats": ("latissimus dorsi",),
    "lower-back": ("erector spinae", "thoracolumbar"),
    "quads": ("vastus", "rectus femoris"),
    "hamstrings": ("biceps femoris", "semitendinosus", "semimembranosus"),
    "glutes": ("gluteus maximus", "gluteus medius"),
    "adductors": ("adductor", "gracilis"),
    "calves": ("gastrocnemius", "soleus"),
}

def lerp(a, b, t):
    return a + (b-a)*t

def envelope(z, low, high, margin):
    t = max(0.0, min(1.0, (z-low)/margin, (high-z)/margin))
    return t*t*(3-2*t)

def ray(atlas, center, point):
    outward = point - center
    outward.z = 0
    radius = outward.length
    if radius < .0005:
        return radius, None
    direction = outward / radius
    outside = center + .22 * direction
    hit, _, face, _ = atlas.ray_cast(outside, -direction, .217)
    return ((hit-center).length, face) if hit is not None else (radius, None)

def atlas_tree(muscles):
    """Keep the named muscles defining the outer contour, including access to their IDs."""
    vertices, faces, regions = [], [], []
    for obj in muscles:
        name = obj.name.lower()
        region = next((key for key, terms in REGIONS.items()
                       if any(term in name for term in terms)), None)
        if region is None:
            continue
        transform = obj.matrix_world
        start = len(vertices)
        vertices.extend(transform @ vert.co for vert in obj.data.vertices)
        obj.data.calc_loop_triangles()
        for triangle in obj.data.loop_triangles:
            faces.append(tuple(start+index for index in triangle.vertices))
            regions.append(region)
    if not faces:
        raise RuntimeError("No atlas surface triangles")
    return BVHTree.FromPolygons(vertices, faces, all_triangles=True), regions

def fit_surface(body, rig, muscles, charcoal, purple):
    for joint in rig.pose.bones:
        joint.rotation_mode = "QUATERNION"
        joint.rotation_quaternion = Quaternion((1,0,0,0))
    bpy.context.view_layer.update()
    atlas, atlas_regions = atlas_tree(muscles)
    matrix = body.matrix_world.copy()
    inverse = matrix.inverted()
    positions = [matrix @ vert.co for vert in body.data.vertices]
    ground = min(p.z for p in positions)
    height = max(p.z for p in positions) - ground
    assert 1.5 < height < 2
    pelvis_root = (rig.matrix_world @ rig.data.bones["upperleg01.L"].head_local)
    knee = (rig.matrix_world @ rig.data.bones["lowerleg01.L"].head_local)
    hip_width, knee_width = abs(pelvis_root.x), abs(knee.x)
    z_hip, z_knee = pelvis_root.z, knee.z

    displacements, labels = [], []
    for p in positions:
        z = (p.z-ground)/height
        side = 1 if p.x >= 0 else -1
        torso = envelope(z,.55,.847,.06)
        leg = envelope(z,.276,.57,.045)
        calf = envelope(z,.105,.285,.044)
        # Use anatomical cross sections, restricting transfer to the torso and
        # limbs that face the same direction in both source models.
        if torso and abs(p.x) < lerp(.145,.225, min(1,max(0,(z-.62)/.19))):
            section = "torso"
            strength = torso * .78
            local = Vector((0,.015,p.z))
            source = Vector((0,-.014,(z-.55)*(.47/.297)+.93))
            aim = Vector((p.x,(p.y-local.y),0))
            allowed = {"chest","abs","obliques","delts","traps","lats","lower-back"}
        elif abs(p.x) < .247 and (leg or calf):
            section = "leg" if leg else "calf"
            k = min(1,max(0,(p.z-z_knee)/(z_hip-z_knee)))
            local = Vector((side*lerp(knee_width,hip_width,k),lerp(knee.y,pelvis_root.y,k),p.z))
            src_x = lerp(.086,.094,k)
            src_y = lerp(.014,.013,k)
            src_z = (.432 + (z-.276)*(.49/.294)) if leg else (.135+(z-.105)*(.31/.18))
            source = Vector((side*src_x,src_y,src_z))
            aim = Vector((p.x-local.x,p.y-local.y,0))
            strength = (leg or calf) * .74
            allowed = {"quads","hamstrings","glutes","adductors"} if leg else {"calves"}
        else:
            displacements.append(Vector())
            labels.append(None)
            continue
        current = aim.length
        radius, index = ray(atlas, source, source+aim)
        label = atlas_regions[index] if index is not None else None
        if label not in allowed or current < .005:
            displacements.append(Vector())
            labels.append(None)
            continue
        if section == "torso":
            radius *= 1.06
        # Limit the atlas difference so that joints and the continuous outside
        # surface keep the original weight paint and never jump to the far limb.
        delta = max(-.021,min(.038,radius-current)) * strength
        displacements.append(aim.normalized()*delta)
        labels.append(label)

    # GLB duplicates vertices at UV and normal seams. Average displacements
    # across coincident vertices before smoothing to keep those seams closed.
    groups, neighbors = defaultdict(list), defaultdict(set)
    keys = [tuple(round(float(item),5) for item in point) for point in positions]
    for index, key in enumerate(keys):
        groups[key].append(index)
    for edge in body.data.edges:
        a,b = (keys[i] for i in edge.vertices)
        if a!=b:
            neighbors[a].add(b)
            neighbors[b].add(a)
    field = {key:sum((displacements[i] for i in values),Vector())/len(values)
             for key, values in groups.items()}
    for _ in range(3):
        field = {key:(value*.6 + sum((field[n] for n in neighbors[key]),Vector())*.4/len(neighbors[key])
                      if neighbors[key] else value) for key,value in field.items()}

    changed = 0
    for vert, original, key in zip(body.data.vertices,positions,keys):
        shift = field[key]
        changed += int(shift.length > .001)
        vert.co = inverse @ (original+shift)
    assert changed > 500, f"Only {changed} vertices transfer atlas contours"
    body.data.update()

    # Keep the original rig and remove skin textures to make muscle contours
    # legible in the same matte plaster finish as the visual reference.
    body.data.materials.append(purple)
    purple_slot = len(body.data.materials)-1
    tagged = defaultdict(int)
    for face in body.data.polygons:
        face.use_smooth = True
        point = matrix @ face.center
        z = (point.z-ground)/height
        hits = [labels[i] for i in face.vertices if labels[i]]
        region = max(set(hits),key=lambda item:(hits.count(item),item)) if hits else None
        if abs(point.x) < .183 and .46 < z < .568 and region != "glutes":
            face.material_index = 1
        elif region in {"quads","glutes"}:
            face.material_index = purple_slot
        else:
            face.material_index = 0
        if region:
            tagged[region] += 1
    assert tagged["quads"] > 100 and tagged["glutes"] > 60, dict(tagged)
    with open("evidence/fitted-surface.json","w",encoding="utf-8") as output:
        json.dump({"vertices_changed":changed,"regions":dict(tagged),
                   "bones":len(rig.data.bones)},output,indent=2)

def write_model(body, rig):
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath="evidence/form-fitted-review.glb",
                              use_selection=True, export_animations=False)
