"""Создай 3D объект в Blender: finish the entire region, repair road surfaces, enable DCs."""
import bpy,bmesh,sys,json,math,random,shutil
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent));from blender_common import *
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/city';WEB=ROOT/'public/models/living-city'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'Metropolis_Living_v3.blend'));s=bpy.context.scene
manifest=json.loads((WEB/'manifest.json').read_text(encoding='utf8'));baseline=OUT/'visual-v2-before.glb'
if not baseline.exists():shutil.copy2(WEB/'living-city.glb',baseline)
playable=bpy.data.collections['Interactive / buildings and shops'];shells=bpy.data.collections['Buildings / editable exterior shells'];landscape=bpy.data.collections['Streets / parks / surroundings'];random.seed(81)
# Delete oversized background faces, never stretch the city or actor paths.
removed=0
for o in list(landscape.objects):
 if o.type!='MESH':continue
 bm=bmesh.new();bm.from_mesh(o.data);bad=[]
 for f in bm.faces:
  vs=[o.matrix_world@v.co for v in f.verts]
  if any(v.x < -39 or v.x>49 or v.y<-33 or v.y>37 for v in vs):bad.append(f)
 removed+=len(bad);bmesh.ops.delete(bm,geom=bad,context='FACES');bm.to_mesh(o.data);bm.free()
 # The remaining site foundation is a landscape surface, not an empty gray table.
 attr=o.data.color_attributes.active_color
 if attr:
  for p in o.data.polygons:
   vs=[o.data.vertices[i].co for i in p.vertices]
   if max(v.x for v in vs)-min(v.x for v in vs)>60 or max(v.y for v in vs)-min(v.y for v in vs)>55:
    for li in p.loop_indices:attr.data[li].color=(.15,.23,.19,1)
# Separate the actual existing northern/southern DC exteriors from scenery, preserving colors.
for key,sign in [('dc-north',1),('dc-south',-1)]:
 parts=[]
 for o in list(landscape.objects):
  if o.type!='MESH':continue
  ids=[]
  for p in o.data.polygons:
   vs=[o.matrix_world@o.data.vertices[i].co for i in p.vertices]
   if all(26.2<v.x<44.5 and 8<sign*v.y<29.5 for v in vs) and max(v.z for v in vs)>.18:ids.append(p.index)
  if not ids:continue
  selected=set(ids);cp=o.copy();cp.data=o.data.copy();playable.objects.link(cp)
  bm=bmesh.new();bm.from_mesh(cp.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in selected],context='FACES');bm.to_mesh(cp.data);bm.free();parts.append(cp)
  bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index in selected],context='FACES');bm.to_mesh(o.data);bm.free()
 ob=join(parts,'location_'+key)
 assert ob is not None,'Missing actual DC geometry '+key
 ob['game_id']=key;ob['kind']='location'
# Consistent local palette for additional exterior detail.
asphalt=mat('Region asphalt',(.07,.10,.12));pavement=mat('Region sandstone',(.36,.40,.37));cream=mat('Region markings',(.72,.70,.56));brick=mat('Region terra-cotta',(.36,.19,.12));limestone=mat('Region limestone',(.48,.48,.36));steel=mat('Region slate',(.11,.18,.21),.25,.7);glass=mat('Region glazing',(.09,.22,.27),.3,.3);foliage=mat('Region canopy',(.15,.28,.14));trunk=mat('Region timber',(.22,.13,.07));water=mat('Region water',(.06,.20,.23),.2,.3);light=mat('Region illumination',(.8,.62,.3),0,.5,1)
added=[]
def add(o):
 for c in list(o.users_collection):c.objects.unlink(o)
 landscape.objects.link(o);added.append(o);return o

def b(name,x,y,z,w,d,h,m,bev=0):return add(cube(name,(x,y,z),(w,d,h),m,bev))
# Single unioned road surface eliminates overlapping intersections and coplanar asphalt.
roads=[]
for k in [-25,-19,-13,-7,7,13,19,25]:roads.extend([(k-.65,-26,k+.65,26),(-26,k-.65,26,k+.65)])
roads.extend([(-34,-29.7,44,-28.3),(-34,31.3,44,32.7),(-34.7,-29,-33.3,32),(43.3,-29,44.7,32),(25,-.65,44,.65),(40.6,-29,41.8,32),(25,-18.6,44,-17.4),(25,17.4,44,18.6)])
xs=sorted(set(v for r in roads for v in [r[0],r[2]]));ys=sorted(set(v for r in roads for v in [r[1],r[3]]));verts=[];faces=[]
for x1,x2 in zip(xs,xs[1:]):
 for y1,y2 in zip(ys,ys[1:]):
  x=(x1+x2)/2;y=(y1+y2)/2
  if any(a<=x<=c and bb<=y<=dd for a,bb,c,dd in roads):
   i=len(verts);verts.extend([(x1,y1,.087),(x2,y1,.087),(x2,y2,.087),(x1,y2,.087)]);faces.append((i,i+1,i+2,i+3))
me=bpy.data.meshes.new('Continuous road network');me.from_pydata(verts,[],faces);me.materials.append(asphalt);o=bpy.data.objects.new(me.name,me);landscape.objects.link(o);added.append(o)
for k in [-25,-19,-13,-7,7,13,19,25]:
 for v in range(-25,26,2):
  if min(abs(v-cross) for cross in [-25,-19,-13,-7,7,13,19,25])<1.1:continue
  b('Lane paint',k,v,.093,.035,.7,.007,cream);b('Lane paint',v,k,.093,.7,.035,.007,cream)
for x,y in [(-7,-7),(7,7),(-19,-19),(19,19),(25,0),(41.2,0)]:
 for i in range(5):b('Crosswalk',x-1+i*.17,y,.098,.08,1.05,.008,cream)
# Fill the unused border blocks with neighbourhoods, loading yards and planted boulevards.
def tree(x,y,h=1):
 b('Tree trunk',x,y,.25*h,.055,.055,.5*h,trunk)
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.34*h,location=(x,y,.66*h));o=bpy.context.object;o.scale=(1,.9,1.4);o.data.materials.append(foliage);add(o)
def house(x,y,index):
 h=.65+(index%4)*.16;m=brick if index%3==0 else limestone if index%3==1 else steel
 b('Neighbourhood plinth',x,y,.11,1.55,1.6,.10,pavement)
 b('Neighbourhood building',x,y,.15+h/2,1.25,1.30,h,m,.035);b('Roof rim',x,y,h+.2,1.32,1.37,.08,steel)
 for dx in [-.34,.34]:
  for z in [.4,.72]:
   if z<h+.05:b('Window',x+dx,y-.66,z,.24,.016,.2,glass)
 b('Front door',x,y-.66,.32,.17,.018,.32,trunk);b('Canopy',x,y-.78,.55,.44,.3,.045,cream)
 b('Roof HVAC',x+.25,y+.15,h+.33,.32,.34,.22,steel,.02)
for i,x in enumerate(range(-30,25,3)):
 for y in [-31,34]:house(x,y,i)
for i,y in enumerate(range(-25,30,3)):
 for x in [-36.7,-30.7]:house(x,y,i+2)
for i,x in enumerate(range(-29,25,3)):
 for y in [-27.5,30]:tree(x,y,.7+(i%3)*.15)
for y in range(-26,30,3):tree(46,y,.8)
# Developed eastern corridor joins the starter campus to the industrial complexes.
for x in [28,30.5,33,35.5,38]:
 for y in [-10,9]:
  b('Service yard',x,y,.09,2.2,2.2,.08,pavement)
  b('Logistics unit',x,y,.5,1.6,1.2,.8,steel,.025)
  for i in range(3):b('Loading shutter',x-.48+i*.48,y-.62,.5,.35,.025,.6,edge if 'edge' in globals() else cream)
  b('Warehouse roof',x,y,.94,1.75,1.35,.10,limestone)
for x in range(28,41,2):
 for y in [-6.7,6.7]:tree(x,y,.65)
# Make each original starter building legible at the street scale, without changing its footprint.
for o in list(playable.objects):
 if o.get('game_id') not in ['garage','workshop','technopark','server-hall','campus']:continue
 vs=[o.matrix_world@v.co for v in o.data.vertices];mn=Vector(tuple(min(v[i] for v in vs) for i in range(3)));mx=Vector(tuple(max(v[i] for v in vs) for i in range(3)));cx=(mn.x+mx.x)/2
 parts=[]
 before=set(bpy.context.scene.objects)
 cube('Entrance canopy',(cx,mn.y-.10,mn.z+.3),(min(.6,mx.x-mn.x),.3,.04),steel,.01)
 cube('Door glazing',(cx,mn.y-.012,mn.z+.15),(.17,.025,.28),glass)
 for x in [mn.x+.12,mx.x-.12]:cube('Facade light',(x,mn.y-.03,mn.z+.25),(.04,.03,.12),light)
 for i in range(3):cube('Roof equipment',(mn.x+.16+i*.18,(mn.y+mx.y)/2,mx.z+.06),(.12,.16,.10),steel,.009)
 parts=[ob for ob in bpy.context.scene.objects if ob not in before]+[o];name=o.name;props=dict(o.items());new=join(parts,name)
 for c in list(new.users_collection):c.objects.unlink(new)
 playable.objects.link(new)
 for k,v in props.items():new[k]=v
# Regenerate exact selection extents, including both new purchasable DCs.
entries=[]
for o in playable.objects:
 key=o.get('game_id');kind=o.get('kind')
 if not key:
  old=next((e for e in manifest['objects'] if e['node']==o.name),None)
  if not old:continue
  key=old['id'];kind=old['kind']
 vs=[o.matrix_world@v.co for v in o.data.vertices];mn=Vector(tuple(min(v[i] for v in vs) for i in range(3)));mx=Vector(tuple(max(v[i] for v in vs) for i in range(3)));c=(mn+mx)/2
 entries.append({'id':key,'kind':kind,'node':o.name,'min':[mn.x*100,mn.z*100,-mx.y*100],'max':[mx.x*100,mx.z*100,-mn.y*100],'roof':[c.x*100,mx.z*100,-c.y*100]})
assert len(entries)==12,len(entries)
# Consolidate newly authored palettes into the two existing vertex-color materials before spatial batching.
matte=next(m for m in bpy.data.materials if m.name.startswith('Web /') and 'illumination' not in m.name) if any(m.name.startswith('Web /') for m in bpy.data.materials) else None
# Explicit shared materials also work independently of historical naming.
vm=mat('Region vertex palette',(1,1,1),.15,.78);vl=mat('Region vertex illumination',(1,1,1),0,.5,1)
for m in [vm,vl]:
 p=m.node_tree.nodes['Principled BSDF'];vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';m.node_tree.links.new(vc.outputs['Color'],p.inputs['Base Color'])
 if m==vl:m.node_tree.links.new(vc.outputs['Color'],p.inputs['Emission Color'])
for o in list(landscape.objects)+list(playable.objects):
 if o.type!='MESH' or not o.data.polygons:continue
 attr=o.data.color_attributes.get('Color')
 if not attr:
  attr=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  for p in o.data.polygons:
   m=o.data.materials[p.material_index]
   for li in p.loop_indices:attr.data[li].color=m.diffuse_color
  o.data.color_attributes.active_color=attr
 else:
  # Joined starter additions may have uninitialised color data: restore from their own material.
  for p in o.data.polygons:
   m=o.data.materials[p.material_index]
   if m.name.startswith('Region '):
    for li in p.loop_indices:attr.data[li].color=m.diffuse_color
 luminous=[]
 for p in o.data.polygons:
  m=o.data.materials[p.material_index];pr=m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
  luminous.append(bool(pr and pr.inputs['Emission Strength'].default_value>.05))
 o.data.materials.clear();o.data.materials.append(vm);o.data.materials.append(vl)
 for p,lit in zip(o.data.polygons,luminous):p.material_index=int(lit)
# Save a fully editable Blender file and two non-interactive render previews.
s.camera.location=(74,-80,75);s.camera.rotation_euler=(Vector((6,1,0))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=108;s.render.resolution_x=1500;s.render.resolution_y=1100;s.cycles.samples=16;s.render.filepath=str(OUT/'region-v4.png');bpy.ops.render.render(write_still=True)
s.camera.location=(43,-8,8);s.camera.rotation_euler=(Vector((35.5,0,.3))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=14;s.render.filepath=str(OUT/'starter-v4.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Metropolis_Living_v4.blend'),compress=True)
export=bpy.data.scenes.new('Web export');bpy.context.window.scene=export
for o in playable.objects:export.collection.objects.link(o)
# Old dog is retained; humanoid and car variants load from their own authored files.
for o in s.objects:
 if o.get('actor_template'):export.collection.objects.link(o)
buckets={}
for o in list(shells.objects)+list(landscape.objects):
 if not o.data.vertices:continue
 c=sum((o.matrix_world@v.co for v in o.data.vertices),Vector())/len(o.data.vertices);buckets.setdefault((math.floor(c.x/12),math.floor(c.y/12)),[]).append(o)
for key,obs in buckets.items():
 copies=[]
 for o in obs:
  cp=o.copy();cp.data=o.data.copy();export.collection.objects.link(cp);copies.append(cp)
 join(copies,'City block %s %s'%key)
bpy.ops.export_scene.gltf(filepath=str(WEB/'living-city.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,export_draco_position_quantization=14,export_draco_color_quantization=8)
manifest.update(source='artifacts/city/Metropolis_Living_v4.blend',objects=entries,webBatches=len(buckets),glbBytes=(WEB/'living-city.glb').stat().st_size,bounds=[-3900,-3700,4900,3300],actorFiles=['person-1','person-2','person-3','car-1','car-2','car-3'])
# Actor feet sit on the repaired road surface; no body is embedded in asphalt.
for route in manifest['routes']:
 for p in route['points']:p[1]=10
(WEB/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
report={'beforeBytes':baseline.stat().st_size,'afterBytes':manifest['glbBytes'],'exportTriangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in export.objects if o.type=='MESH'),'webBatches':len(buckets),'removedOversizedFaces':removed,'locations':[e['id'] for e in entries if e['kind']=='location']}
(OUT/'v4-budget.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(report)
