"""Создай 3D объект в Blender: reference-directed city, preserving interactive IDs and traffic paths."""
import bpy,math,json,sys,random,shutil
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent));from blender_common import mat,join
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/city';WEB=ROOT/'public/models/living-city'
manifest=json.loads((WEB/'manifest.json').read_text());random.seed(1609)
layout=OUT/'reference-layout.json'
if not layout.exists():layout.write_text(json.dumps(manifest['objects'],indent=2))
manifest['objects']=json.loads(layout.read_text())
if not (OUT/'before-reference-city.glb').exists():shutil.copy2(WEB/'living-city.glb',OUT/'before-reference-city.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
materials=[mat('Stone and masonry',(1,1,1),.08,.72),mat('Architectural glass',(1,1,1),.48,.24),mat('Window illumination',(1,1,1),.1,.38,.65)]
for m in materials:
 p=m.node_tree.nodes['Principled BSDF'];vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';m.node_tree.links.new(vc.outputs['Color'],p.inputs['Base Color'])
 if 'illumination' in m.name:m.node_tree.links.new(vc.outputs['Color'],p.inputs['Emission Color'])
STONE=(.52,.48,.39,1);TRIM=(.66,.62,.51,1);DARK=(.08,.105,.12,1);GLASS=(.10,.20,.25,1);PAVE=(.36,.38,.35,1);ROAD=(.065,.082,.09,1);GREEN=(.12,.22,.13,1);BRICKS=[(.35,.20,.14,1),(.46,.30,.21,1),(.44,.43,.36,1),(.26,.31,.33,1)]
class Mesh:
 def __init__(self):self.v=[];self.f=[];self.c=[];self.mi=[]
 def face(self,vs,c,mi=0):
  n=len(self.v);self.v.extend(vs);self.f.append(tuple(range(n,n+len(vs))));self.c.append(c);self.mi.append(mi)
 def box(self,x,y,z,w,d,h,c,mi=0):
  x0=x-w/2;x1=x+w/2;y0=y-d/2;y1=y+d/2;z0=z-h/2;z1=z+h/2
  for vs in [[(x0,y0,z0),(x0,y1,z0),(x1,y1,z0),(x1,y0,z0)],[(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],[(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1)],[(x1,y1,z0),(x0,y1,z0),(x0,y1,z1),(x1,y1,z1)],[(x0,y1,z0),(x0,y0,z0),(x0,y0,z1),(x0,y1,z1)],[(x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1)]]:self.face(vs,c,mi)
 def disc(self,x,y,z,r,h,c,n=10):
  top=[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),z+h/2) for i in range(n)];bot=[(a,b,z-h/2) for a,b,_ in top];self.face(top,c);self.face(bot[::-1],c)
  for i in range(n):j=(i+1)%n;self.face([bot[i],bot[j],top[j],top[i]],c)
 def finish(self,name):
  me=bpy.data.meshes.new(name);me.from_pydata(self.v,[],self.f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
  for m in materials:me.materials.append(m)
  attr=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  for p,c,mi in zip(me.polygons,self.c,self.mi):
   p.material_index=mi
   for li in p.loop_indices:attr.data[li].color=c
  me.color_attributes.active_color=attr;return o
scenery=[];interactive=[]
def tree(m,x,y,size=1):
 m.disc(x,y,.32*size,.035*size,.60*size,(.20,.14,.09,1),6)
 # An irregular oval crown gives trees a softer natural silhouette.
 rings=[]
 for j in range(7):
  a=math.pi*j/6;r=.32*size*math.sin(a);rings.append([(x+r*math.cos(k*math.tau/10)*(1+.06*math.sin(k*3)),y+r*math.sin(k*math.tau/10),.84*size+.43*size*math.cos(a)) for k in range(10)])
 for j in range(6):
  for k in range(10):m.face([rings[j][k],rings[j+1][k],rings[j+1][(k+1)%10],rings[j][(k+1)%10]],GREEN)
def tower(m,x,y,w,d,h,index):
 m.box(x,y,.19,w+.28,d+.28,.20,PAVE);m.box(x,y,h/2+.27,w,d,h,GLASS,1)
 brick=BRICKS[index%len(BRICKS)]
 floors=max(2,round(h/.48));step=h/floors
 for level in range(floors+1):
  z=.27+level*step;m.box(x,y,z,w+.08,d+.08,.052,TRIM if index%3 else brick)
 for axis in range(2):
  width=w if axis==0 else d;dep=d if axis==0 else w;n=max(3,round(width/.40))
  for side in [-1,1]:
   for k in range(n+1):
    u=-width/2+k*width/n;a=x+u if axis==0 else x+side*dep/2;b=y+side*dep/2 if axis==0 else y+u
    m.box(a,b,h/2+.27,.055 if axis==0 else .075,.075 if axis==0 else .055,h,brick if index%3 else TRIM)
   if index%3:
    # Broad piers alternating with dark recessed-looking glass bays.
    for k in range(n):
     u=-width/2+(k+.5)*width/n
     for level in range(1,floors):
      a=x+u if axis==0 else x+side*(dep/2+.012);b=y+side*(dep/2+.012) if axis==0 else y+u;z=.27+level*step+.10
      m.box(a,b,z,width/n-.06 if axis==0 else .04,.04 if axis==0 else width/n-.06,.16,brick)
 m.box(x,y,h+.30,w+.13,d+.13,.10,TRIM);m.box(x,y,h+.36,w-.12,d-.12,.04,DARK)
 for dx in [-w*.25,w*.25]:
  m.box(x+dx,y+.2,h+.47,.34,.38,.2,(.27,.31,.31,1));m.box(x+dx,y+.2,h+.58,.29,.33,.025,DARK)
 m.box(x,y-d/2-.10,.70,min(.8,w*.65),.32,.06,DARK)
 m.box(x,y-d/2-.04,.42,.37,.04,.35,GLASS,1)
 if h>4:
  # Stepped roof crown gives the downtown skyline varied silhouettes.
  m.box(x,y,h+.62,w*.62,d*.64,.56,brick);m.box(x,y,h+.94,w*.67,d*.69,.06,TRIM)
# A finite developed terrain, with no giant gray background plane.
m=Mesh();m.box(5,2,-.11,88,70,.26,(.17,.22,.18,1));scenery.append(m.finish('Land / bounded city'))
roads=[];grid=[-31,-25,-19,-13,-7,7,13,19,25]
for k in grid:roads += [(k-.72,-29,k+.72,32),(-34,k-.72,26,k+.72)]
roads += [(-34.72,-29,-33.28,32),(43.28,-29,44.72,32),(-34,-29.72,44,-28.28),(-34,31.28,44,32.72),(25,-.72,44,.72),(40.48,-29,41.92,32),(25,-18.72,44,-17.28),(25,17.28,44,18.72)]
xs=sorted({r[i] for r in roads for i in [0,2]});ys=sorted({r[i] for r in roads for i in [1,3]});m=Mesh()
for a,b in zip(xs,xs[1:]):
 for c,d in zip(ys,ys[1:]):
  if any(x0<(a+b)/2<x1 and y0<(c+d)/2<y1 for x0,y0,x1,y1 in roads):m.face([(a,c,.087),(b,c,.087),(b,d,.087),(a,d,.087)],ROAD)
for k in grid:
 for v in range(-27,31):
  if min(abs(v-g) for g in grid)<1.2:continue
  m.box(k,v,.09,.027,.44,.004,(.66,.65,.52,1))
  if v<26:m.box(v,k,.09,.44,.027,.004,(.66,.65,.52,1))
scenery.append(m.finish('Roads / continuous junctions'))
# Reserve the same semantic footprints, so saved property ownership and selection stay valid.
reserved=[]
for e in manifest['objects']:
 if e['kind']!='location' or e['id'] not in ['dc-north','dc-south']:reserved.append((e['min'][0]/100-.4,-e['max'][2]/100-.4,e['max'][0]/100+.4,-e['min'][2]/100+.4))
def blocked(x,y,w,d):return any(x+w/2>a and x-w/2<c and y+d/2>b and y-d/2<e for a,b,c,e in reserved)
count=0
for x in [-28,-22,-16,-10,10,16,22]:
 for y in [-26.8,-22,-16,-10,10,16,22,28.8]:
  if y==-26.8:continue
  m=Mesh();m.box(x,y,.075,4.50,4.50,.07,PAVE)
  for dx,dy in [(-1.12,-1.12),(1.12,-1.12),(-1.12,1.12),(1.12,1.12)]:
   bx=x+dx;by=y+dy
   if blocked(bx,by,1.92,1.90):continue
   central=abs(x)<18 and abs(y)<20;h=random.uniform(2.2,5.8) if central else random.uniform(1.1,2.9)
   tower(m,bx,by,1.9,1.88,h,count);count+=1
  for dx,dy in [(-2.03,-1),(-2.03,1),(2.03,-1),(2.03,1)]:tree(m,x+dx,y+dy,.7)
  scenery.append(m.finish('Quarter %s %s'%(x,y)))
# Infill across the broad central axes; retain the pedestrian square and semantic footprints.
for x in [-4.1,0,4.1]:
 for y in [-22,-16,-10,10,16,22,28.6]:
  if blocked(x,y,2.6,2.7):continue
  m=Mesh();tower(m,x,y,2.6,2.7,random.uniform(2,5.8),count);count+=1;tree(m,x+1.5,y+.9,.85);scenery.append(m.finish('Central infill %s %s'%(x,y)))
for x in [-28,-22,-16,-10,10,16,22]:
 for y in [-4.1,0,4.1]:
  if blocked(x,y,3.5,2.5):continue
  m=Mesh();tower(m,x,y,3.5,2.5,random.uniform(1.5,3.7),count);count+=1;tree(m,x-1.9,y,.8);scenery.append(m.finish('Civic boulevard %s %s'%(x,y)))
# Small perimeter quarters complete the city boundary.
for x in range(-30,26,4):
 for y in [-31.5,34.5]:
  m=Mesh();tower(m,x,y,2.5,1.5,random.uniform(1.1,2.2),count);count+=1;tree(m,x+1.5,y,.8);scenery.append(m.finish('Perimeter %s %s'%(x,y)))
for y in range(-26,31,4):
 m=Mesh();tower(m,-36.5,y,2,2,1.8,count);tree(m,-35,y,.7);count+=1;scenery.append(m.finish('West quarter %s'%y))
# Central public space and footpaths coincide with existing pedestrian routes.
m=Mesh();m.box(0,0,.055,12.4,12.0,.09,PAVE);m.box(0,0,.109,6.3,5.8,.02,(.25,.31,.25,1))
for x in [-5.65,5.65]:
 for y in [-4,-2,0,2,4]:tree(m,x,y,.85)
for x in [-2.4,0,2.4]:
 for y in [-2.8,2.8]:m.box(x,y,.20,.58,.18,.20,STONE)
m.disc(0,0,.17,1.13,.18,STONE,32);m.disc(0,0,.268,1.0,.015,(.10,.27,.30,1),32);m.disc(0,0,.5,.17,.49,TRIM,12)
scenery.append(m.finish('Civic square and fountain'))
# Starter technology campus remains readable and accessible at its original coordinates.
m=Mesh();m.box(35.5,0,.11,13.3,10.6,.04,PAVE)
for x in [29,31,33,35,37,39,41]:
 for y in [-4.3,4.3]:tree(m,x,y,.75)
scenery.append(m.finish('Technology campus landscaping'))
for entry in manifest['objects']:
 key=entry['id'];m=Mesh();x=(entry['min'][0]+entry['max'][0])/200;y=-(entry['min'][2]+entry['max'][2])/200
 if key.startswith('dc-'):
  sign=1 if key=='dc-north' else -1
  for hx in [30.1,35.8]:
   for hy in [12.6,23.3]:
    hy*=sign;m.box(hx,hy,.115,4.9,6.4,.08,PAVE);m.box(hx,hy,.75,4.3,5.8,1.28,STONE)
    m.box(hx,hy,1.43,4.44,5.94,.10,TRIM)
    for dx in [-1.75,-1.05,-.35,.35,1.05,1.75]:
     m.box(hx+dx,hy-2.93,.77,.045,.05,1.15,DARK)
     for dy in [-1.7,0,1.7]:m.box(hx+dx,hy+dy,1.63,.46,.64,.33,DARK);m.disc(hx+dx,hy+dy,1.81,.16,.025,TRIM,8)
    m.box(hx,hy-2.94,.56,.64,.04,.78,GLASS,1)
  for hy in range(9,29,3):tree(m,39.3,sign*hy,.7)
 elif entry['kind']=='tower':tower(m,x,y,1.9,1.65,{'meridian':5.2,'horizon':7.2,'orbit':9.5}[key],0)
 elif entry['kind']=='shop':tower(m,x,y,1.65,1.8,1.05,2)
 else:
  w=(entry['max'][0]-entry['min'][0])/100;d=(entry['max'][2]-entry['min'][2])/100;h={'garage':.48,'workshop':.70,'technopark':1.10,'server-hall':.85,'campus':1.65}[key]
  m.box(x,y,.25+h/2,w,d,h,BRICKS[2] if key=='garage' else STONE);m.box(x,y,.28+h,w+.08,d+.08,.07,DARK)
  if key=='garage':
   m.box(x,y-d/2-.012,.45,w*.67,.025,.36,DARK)
   for i in range(6):m.box(x,y-d/2-.028,.30+i*.055,w*.64,.012,.009,TRIM)
  else:
   for dx in [-w*.3,0,w*.3]:m.box(x+dx,y-d/2-.012,.3+h*.47,w*.23,.025,h*.64,GLASS,1)
  m.box(x,y-d/2-.12,.65,min(.65,w),.30,.045,TRIM)
  m.box(x+.12,y+.1,h+.38,.23,.26,.16,DARK)
 o=m.finish(entry['node']);o['game_id']=key;o['kind']=entry['kind'];interactive.append(o)
# Boulevard street furniture in compact geometry batches.
m=Mesh();lamps=[]
for k in [-19,-7,7,19]:
 for v in [-22,-16,-10,10,16,22]:
  x=k+.98;y=v;m.disc(x,y,.43,.018,.82,DARK,6);m.box(x,y,.86,.19,.07,.028,TRIM);m.box(x,y,.844,.15,.055,.01,(.9,.72,.39,1),2)
  if len(lamps)<6:lamps.append([x*100,86,-y*100])
  for i in range(5):m.box(k-.5+i*.22,v-2.25,.093,.11,1.18,.005,(.73,.73,.63,1))
scenery.append(m.finish('Street lighting and crossings'))
# Small dog template is preserved from the previous local authoring file.
with bpy.data.libraries.load(str(OUT/'Metropolis_Living_v4.blend'),link=False) as (available,loaded):loaded.objects=[n for n in available.objects if n=='actor_dog']
for o in loaded.objects:
 if o:bpy.context.collection.objects.link(o);o.hide_render=True
entries=[]
for o,old in zip(interactive,manifest['objects']):
 vs=[o.matrix_world@v.co for v in o.data.vertices];mn=Vector(tuple(min(v[i] for v in vs) for i in range(3)));mx=Vector(tuple(max(v[i] for v in vs) for i in range(3)));c=(mn+mx)/2
 entries.append(dict(id=old['id'],kind=old['kind'],node=o.name,min=[mn.x*100,mn.z*100,-mx.y*100],max=[mx.x*100,mx.z*100,-mn.y*100],roof=[c.x*100,mx.z*100,-c.y*100]))
s=bpy.context.scene;s.world=bpy.data.worlds.new('City atmosphere');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.31,.38,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.6
ld=bpy.data.lights.new('Late afternoon sun','SUN');ld.energy=2.3;ld.angle=.12;o=bpy.data.objects.new('Late afternoon sun',ld);s.collection.objects.link(o);o.rotation_euler=(.45,-.55,-.45)
cd=bpy.data.cameras.new('City overview');cam=bpy.data.objects.new('City overview',cd);s.collection.objects.link(cam);s.camera=cam;cd.type='ORTHO';cam.location=(72,-87,80);cam.rotation_euler=(Vector((5,2,0))-cam.location).to_track_quat('-Z','Y').to_euler();cd.ortho_scale=110
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=1600;s.render.resolution_y=1100;s.render.resolution_percentage=100;s.render.filepath=str(OUT/'reference-city-overview.png');bpy.ops.render.render(write_still=True)
cam.location=(23,-27,19);cam.rotation_euler=(Vector((10,-10,1.5))-cam.location).to_track_quat('-Z','Y').to_euler();cd.ortho_scale=24;s.render.filepath=str(OUT/'reference-city-detail.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Metropolis_Reference_v5.blend'),compress=True)
export=bpy.data.scenes.new('Optimized export');bpy.context.window.scene=export
for o in interactive+loaded.objects:
 if o:export.collection.objects.link(o)
buckets={}
for o in scenery:
 c=sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices);buckets.setdefault((math.floor(c.x/12),math.floor(c.y/12)),[]).append(o)
for key,obs in buckets.items():
 cps=[]
 for o in obs:cp=o.copy();cp.data=o.data.copy();export.collection.objects.link(cp);cps.append(cp)
 join(cps,'City block %s %s'%key)
bpy.ops.export_scene.gltf(filepath=str(WEB/'living-city.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,export_draco_position_quantization=16,export_draco_color_quantization=8)
manifest.update(source='artifacts/city/Metropolis_Reference_v5.blend',objects=entries,webBatches=len(buckets),glbBytes=(WEB/'living-city.glb').stat().st_size,streetLamps=lamps)
(WEB/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
report={'buildings':count,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in export.objects if o.type=='MESH'),'bytes':manifest['glbBytes'],'spatialBatches':len(buckets),'interactiveObjects':len(entries)}
(OUT/'reference-city-budget.json').write_text(json.dumps(report,indent=2));print('CITY_COMPLETE',report)
