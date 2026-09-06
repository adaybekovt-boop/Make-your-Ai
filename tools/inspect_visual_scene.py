import bpy,json
from pathlib import Path
from mathutils import Vector
r=Path.cwd();bpy.ops.wm.open_mainfile(filepath=str(r/'artifacts/city/Metropolis_Living_v3.blend'))
rows=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH' or o.get('animated_resident'):continue
 vs=[o.matrix_world@Vector(v) for v in o.bound_box];mn=[min(v[i] for v in vs) for i in range(3)];mx=[max(v[i] for v in vs) for i in range(3)]
 rows.append({'name':o.name,'collection':[c.name for c in o.users_collection],'min':mn,'max':mx,'tri':sum(len(p.vertices)-2 for p in o.data.polygons),'props':dict(o.items())})
(r/'artifacts/city/scene-inventory.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
