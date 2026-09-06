"""Создай 3D объект в Blender: static street furniture and facade variation."""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/city';WEB=ROOT/'public/models/living-city'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'Metropolis_Living_v2.blend'))
s=bpy.context.scene
manifest=json.loads((WEB/'manifest.json').read_text(encoding='utf8'))
baseline=OUT/'living-city-before.glb'
if not baseline.exists():shutil.copy2(WEB/'living-city.glb',baseline)
def tris(obs):return sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in obs if o.type=='MESH')
playable=bpy.data.collections['Interactive / buildings and shops'];shells=bpy.data.collections['Buildings / editable exterior shells'];landscape=bpy.data.collections['Streets / parks / surroundings']
templates=[o for o in s.objects if o.get('actor_template')]
before_tris=tris(list(playable.objects)+list(shells.objects)+list(landscape.objects)+templates)
s.render.resolution_x=1400;s.render.resolution_y=900;s.cycles.samples=12
cam=s.camera;cam.location=(15,-19,17);cam.rotation_euler=(Vector((0,0,.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=20
s.render.filepath=str(OUT/'atmosphere-before.png');bpy.ops.render.render(write_still=True)
def mat(name,c,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.85;p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission;return m
wood=mat('Street timber',(.32,.18,.09));metal=mat('Street graphite',(.08,.12,.14));light=mat('Street illumination', (1,.66,.24),2);body=mat('Delivery ivory',(.75,.70,.53));glass=mat('Delivery glass',(.07,.17,.23));roof=mat('Kiosk awning',(.26,.43,.34))
added=[]
def box(name,x,y,z,w,d,h,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));o=bpy.context.object;o.name=name;o.scale=(w,d,h);o.data.materials.append(m)
 for c in list(o.users_collection):c.objects.unlink(o)
 landscape.objects.link(o);added.append(o);return o
lamps=[]
for x,y in [(-5.25,-4.5),(-5.25,0),(-5.25,4.5),(5.25,-4.5),(5.25,4.5),(-2,-4.5),(2,4.5),(29.3,-4.2),(34,-4.2),(40,-4.2)]:
 box('Bench seat',x,y,.31,.85,.3,.09,wood);box('Bench back',x,y+.16,.5,.85,.06,.35,wood)
 for dx in [-.3,.3]:box('Bench leg',x+dx,y,.2,.06,.23,.28,metal)
 box('Waste bin',x+.65,y,.3,.22,.22,.43,metal);box('Bin lid',x+.65,y,.54,.25,.25,.05,wood)
 box('Lamp post',x-.65,y,.95,.055,.055,1.7,metal);box('Lamp head',x-.65,y,1.83,.26,.20,.08,light)
 lamps.append([(x-.65)*100,175,-y*100])
for x,y in [(-5,-2.8),(4.9,2.9)]:
 box('Kiosk',x,y,.48,.55,.55,.85,wood);box('Kiosk awning',x,y,1,.8,.75,.10,roof);box('Kiosk display',x,y-.29,.64,.4,.03,.35,light)
for x,y in [(-8.3,-3),(8.3,3),(30,-3.5)]:
 box('Parked delivery van',x,y,.35,.42,.85,.43,body);box('Van windshield',x,y-.3,.61,.37,.2,.2,glass)
 for dx in [-.22,.22]:
  for dy in [-.27,.27]:box('Van wheel',x+dx,y+dy,.2,.08,.16,.18,metal)
# Editable decorative buildings have independent vertex colors. Vary only their walls and heights.
for i,o in enumerate(sorted(shells.objects,key=lambda o:o.name)):
 if o.type!='MESH':continue
 factor=[.94,1.03,1.08,.98,1.0][i%5]
 for v in o.data.vertices:v.co.z=.12+(v.co.z-.12)*factor
 attr=o.data.color_attributes.active_color
 if attr:
  tint=[(1.08,.98,.87),(.88,1.02,1.08),(1.03,1.02,1),(.94,.97,.90)][i%4]
  for c in attr.data:
   rgba=c.color;c.color=(*(min(1,rgba[j]*tint[j]) for j in range(3)),rgba[3])
# Six local pools keep the lighting cost bounded. Remaining lamps are emissive geometry.
for i,(x,y,z) in enumerate(lamps[:6]):
 ld=bpy.data.lights.new('Street pool '+str(i),'POINT');ld.energy=25;ld.color=(1,.63,.24);ld.shadow_soft_size=.25
 lo=bpy.data.objects.new(ld.name,ld);s.collection.objects.link(lo);lo.location=(x/100,-z/100,y/100)
s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
s.render.filepath=str(OUT/'atmosphere-after.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Metropolis_Living_v3.blend'),compress=True)
added_tris=tris(added)
export=bpy.data.scenes.new('Web export');bpy.context.window.scene=export
for o in list(playable.objects)+templates:export.collection.objects.link(o)
buckets={}
for o in list(shells.objects)+list(landscape.objects):
 center=sum((o.matrix_world@v.co for v in o.data.vertices),Vector())/max(1,len(o.data.vertices))
 buckets.setdefault((math.floor(center.x/12),math.floor(center.y/12)),[]).append(o)
for key,obs in buckets.items():
 copies=[]
 for o in obs:
  cp=o.copy();cp.data=o.data.copy();export.collection.objects.link(cp);copies.append(cp)
 bpy.ops.object.select_all(action='DESELECT')
 for o in copies:o.select_set(True)
 bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();copies[0].name='City block %s %s'%key
bpy.ops.export_scene.gltf(filepath=str(WEB/'living-city.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=14,export_draco_color_quantization=8)
manifest.update(source='artifacts/city/Metropolis_Living_v3.blend',streetLamps=lamps[:6],webBatches=len(buckets),glbBytes=(WEB/'living-city.glb').stat().st_size)
(WEB/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
report={'beforeBytes':baseline.stat().st_size,'afterBytes':manifest['glbBytes'],'beforeTriangles':before_tris,'afterTriangles':before_tris+added_tris,'addedTriangles':added_tris,'staticProps':{'bench':48,'bin':24,'lamp':24,'kiosk':36,'van':72},'streetLifeUnchanged':True}
(OUT/'atmosphere-budget.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(report)
