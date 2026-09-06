"""Создай 3D объект в Blender: rare black widebody coupe from two supplied views."""
import bpy, math, json, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from blender_common import *
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'artifacts/actors'; WEB=ROOT/'public/models/actors'
bpy.ops.wm.read_factory_settings(use_empty=True)
paint=mat('Obsidian metallic',(.018,.023,.029),.72,.24)
rubber=mat('Tyres and grille',(.012,.015,.019),.05,.72)
glass=mat('Smoked glass',(.07,.15,.16),.5,.19)
alloy=mat('Forged graphite',(.10,.12,.14),.8,.28)
white=mat('LED rings',(.78,.88,.9),.25,.24,1)
red=mat('Rear LED',(.65,.014,.022),.25,.24,.7)
# Rounded shoulder sections retain a long hood, broad haunches and a low cabin.
def loft(name,sections,m):
 verts=[]
 for y,w,b,t in sections:
  verts += [(-w*.88,y,b),(-w,y,b+.022),(-w,y,t-.024),(-w*.84,y,t),(w*.84,y,t),(w,y,t-.024),(w,y,b+.022),(w*.88,y,b)]
 faces=[tuple(range(7,-1,-1))]
 for j in range(len(sections)-1):
  for k in range(8):faces.append((j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k))
 faces.append(tuple(range((len(sections)-1)*8,len(sections)*8)))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(m)
 return o
loft('Widebody coupe',[(-.36,.145,.083,.18),(-.30,.17,.08,.205),(-.12,.166,.08,.218),(.16,.174,.08,.215),(.32,.168,.085,.205),(.36,.151,.095,.19)],paint)
loft('Cabin glazing',[(-.105,.14,.203,.215),(-.025,.126,.212,.31),(.15,.123,.21,.305),(.255,.143,.205,.22)],glass)
loft('Roof',[(-.025,.126,.299,.315),(.14,.123,.298,.313),(.18,.128,.28,.297)],paint)
for x in [-1,1]:
 line('A pillar',[(x*.14,-.105,.215),(x*.126,-.025,.307)],.009,paint)
 line('Rear pillar',[(x*.12,.145,.305),(x*.145,.255,.218)],.018,paint)
 cube('Window divider',(x*.133,.09,.258),(.01,.014,.085),paint)
 cube('Door handle',(x*.17,.105,.202),(.011,.039,.009),alloy,.003)
 cube('Mirror',(x*.182,-.086,.239),(.045,.045,.024),paint,.009)
 line('Door seam',[(x*.169,-.1,.207),(x*.17,-.09,.115),(x*.173,.145,.115),(x*.173,.16,.207)],.0015,rubber)
 for y in [-.223,.232]:
  cylinder('Tyre',(x*.171,y,.085),.08,.041,rubber,20,(0,math.pi/2,0))
  cylinder('Rim',(x*.194,y,.085),.06,.006,alloy,20,(0,math.pi/2,0))
  cylinder('Rim inset',(x*.198,y,.085),.051,.007,rubber,16,(0,math.pi/2,0))
  cylinder('Hub',(x*.204,y,.085),.015,.008,alloy,10,(0,math.pi/2,0))
  for k in range(10):
   a=k*math.tau/10
   line('Spoke',[(x*.204,y+math.cos(a)*.012,.085+math.sin(a)*.012),(x*.204,y+math.cos(a+.13)*.052,.085+math.sin(a+.13)*.052)],.003,alloy)
  line('Wheel arch flare',[(x*.179,y+math.cos(a)*.092,.085+math.sin(a)*.092) for a in [k*math.pi/16 for k in range(17)]],.01,paint)
 cube('Hood scoop',(x*.064,-.217,.215),(.063,.09,.012),paint,.005)
 cube('Scoop intake',(x*.064,-.263,.216),(.047,.008,.008),rubber,.002)
 cube('Rear light surround',(x*.083,.36,.174),(.124,.011,.035),rubber,.009)
 line('Rear red outline',[(x*.083+dx,.369,.174+dz) for dx,dz in [(-.05,-.012),(.05,-.012),(.055,0),(.05,.012),(-.05,.012),(-.055,0),(-.05,-.012)]],.003,red)
 cube('Exhaust',(x*.104,.367,.099),(.05,.021,.022),alloy,.008)
 cube('Exhaust hollow',(x*.104,.379,.099),(.039,.004,.013),rubber,.004)
cube('Front grille',(0,-.36,.167),(.265,.013,.049),rubber,.009)
for x in [-.116,-.073,.073,.116]:
 cylinder('Round headlight',(x,-.37,.174),.020,.006,alloy,16,(math.pi/2,0,0))
 cylinder('Headlight lens',(x,-.375,.174),.014,.005,glass,16,(math.pi/2,0,0))
 line('Halo',[(x+math.cos(k*math.tau/20)*.017,-.378,.174+math.sin(k*math.tau/20)*.017) for k in range(21)],.0017,white)
cube('Lower intake',(0,-.365,.111),(.226,.015,.03),rubber,.005)
for x in [-.09,-.06,-.03,0,.03,.06,.09]:cube('Grille slat',(x,-.375,.113),(.004,.005,.022),alloy)
cube('Front splitter',(0,-.363,.085),(.332,.061,.009),alloy,.003)
cube('Rear spoiler',(0,.316,.235),(.32,.059,.012),paint,.005)
for x in [-.10,.10]:cube('Spoiler mount',(x,.317,.219),(.017,.023,.025),paint)
batch_materials();count=triangles();assert count<7000,count
bpy.ops.export_scene.gltf(filepath=str(WEB/'car-4.glb'),export_format='GLB',export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7)
preview(OUT/'car-4.png',target=(0,0,.16),span=1.03)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'car-4.blend'),compress=True)
p=WEB/'manifest.json';m=json.loads(p.read_text());m['models']=[a for a in m['models'] if a['file']!='car-4.glb'];m['models'].append({'kind':'car','file':'car-4.glb','source':'artifacts/actors/car-4.blend','triangles':count,'bytes':(WEB/'car-4.glb').stat().st_size,'rare':True,'chance':.1,'intervalGameHours':6});p.write_text(json.dumps(m,indent=2))
p=ROOT/'public/models/living-city/manifest.json';m=json.loads(p.read_text());m['actorFiles']=[a for a in m['actorFiles'] if a!='car-4']+['car-4'];p.write_text(json.dumps(m,indent=2))
print('RARE_CAR_COMPLETE',count)
