"""Создай 3D объект в Blender: yellow city taxi based on supplied front/rear references."""
import bpy,math,json,sys,bmesh
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent));from blender_common import *
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/actors';WEB=ROOT/'public/models/actors'
bpy.ops.wm.read_factory_settings(use_empty=True)
yellow=mat('Taxi yellow',(.98,.62,.012),.3,.3);black=mat('Rubber and checker',(.015,.022,.028),.05,.68);glass=mat('Blue smoked glass',(.11,.22,.25),.35,.22);silver=mat('Wheel alloy',(.48,.56,.60),.8,.28);white=mat('Headlights',(.9,.93,.86),.25,.25,.3);red=mat('Tail lamps',(.65,.017,.027),.3,.24,.25)
def loft(name,sections,m):
 verts=[]
 for y,w,b,t in sections:verts += [(-w*.85,y,b),(-w,y,b+.02),(-w,y,t-.018),(-w*.83,y,t),(w*.83,y,t),(w,y,t-.018),(w,y,b+.02),(w*.85,y,b)]
 faces=[tuple(range(7,-1,-1))]
 for j in range(len(sections)-1):
  for k in range(8):faces.append((j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k))
 faces.append(tuple(range((len(sections)-1)*8,len(sections)*8)))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(m);return o
loft('Sculpted sedan',[(-.33,.118,.079,.157),(-.285,.145,.074,.184),(-.12,.148,.074,.209),(.12,.148,.074,.216),(.275,.14,.083,.204),(.33,.121,.091,.183)],yellow)
loft('Cabin glass',[(-.135,.13,.20,.218),(-.035,.113,.215,.306),(.10,.112,.216,.312),(.245,.128,.20,.223)],glass)
loft('Yellow roof',[(-.039,.116,.302,.317),(.025,.118,.307,.323),(.10,.115,.306,.322),(.14,.116,.287,.30)],yellow)
for side in [-1,1]:
 line('A pillar',[(side*.13,-.135,.218),(side*.114,-.038,.31)],.007,yellow)
 line('C pillar',[(side*.115,.13,.298),(side*.131,.245,.217)],.013,yellow)
 line('Window sill',[(side*.141,-.11,.213),(side*.143,.18,.216)],.003,black)
 line('B pillar',[(side*.14,.055,.215),(side*.115,.055,.314)],.007,black)
 cube('Mirror',(side*.162,-.104,.234),(.036,.043,.028),black,.009)
 for y in [.01,.16]:
  cube('Door handle',(side*.151,y,.197),(.012,.035,.009),black,.003)
  line('Door shut',[(side*.148,y+.038,.203),(side*.15,y+.041,.11),(side*.15,y-.085,.11)],.0012,black)
 for y in [-.215,.215]:
  cylinder('Tyre',(side*.148,y,.075),.07,.032,black,20,(0,math.pi/2,0))
  cylinder('Rim',(side*.166,y,.075),.053,.006,silver,16,(0,math.pi/2,0))
  cylinder('Wheel inset',(side*.170,y,.075),.045,.006,black,16,(0,math.pi/2,0))
  cylinder('Hub',(side*.176,y,.075),.012,.006,silver,10,(0,math.pi/2,0))
  for k in range(10):
   a=k*math.tau/10;line('Alloy spoke',[(side*.175,y+.01*math.cos(a),.075+.01*math.sin(a)),(side*.175,y+.044*math.cos(a+.17),.075+.044*math.sin(a+.17))],.0025,silver)
  line('Wheel arch',[(side*.148,y+.076*math.cos(k*math.pi/16),.075+.076*math.sin(k*math.pi/16)) for k in range(17)],.006,yellow)
 # Small black chequers on the front doors.
 for row in range(2):
  for col in range(5):
   if (row+col)%2==0:cube('Side checker',(side*.151,-.086+col*.012,.191+row*.012),(.002,.011,.011),black)
 # Swept light assemblies follow the nose and rear corners.
 o=cube('Swept headlight',(side*.106,-.301,.174),(.072,.014,.029),white,.007);o.rotation_euler.z=side*.35
 o=cube('Rear red lens',(side*.10,.31,.18),(.082,.016,.036),red,.009);o.rotation_euler.z=-side*.35
 cube('Reverse lamp',(side*.10,.321,.169),(.058,.008,.01),white,.002)
cube('Grille',(0,-.331,.156),(.14,.008,.027),black,.004)
for z in [.15,.162]:cube('Chrome grille bar',(0,-.337,z),(.127,.004,.003),silver)
cube('Lower intake',(0,-.334,.107),(.19,.008,.016),black,.003)
for y in [-.34,.338]:cube('Plate',(0,y,.13),(.09,.005,.023),white,.002)
for row in range(2):
 for col in range(8):
  if (row+col)%2==0:cube('Hood checker',(-.052+col*.015,-.17+row*.013,.204-row*.002),(.013,.012,.002),black)
cube('Roof sign foot',(0,.018,.33),(.153,.064,.009),black,.004)
loft('Taxi roof lantern',[(-.017,.075,.334,.389),(.046,.075,.334,.389)],yellow)
text('Taxi front','TAXI',(0,-.0185,.348),.035,black)
text('Taxi rear','TAXI',(0,.0475,.348),.035,black,(math.pi/2,0,math.pi))
line('Antenna',[(0,.155,.296),(.004,.18,.361)],.0016,black)
batch_materials();count=triangles();assert count<5500,count
bpy.ops.export_scene.gltf(filepath=str(WEB/'car-6.glb'),export_format='GLB',export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7)
preview(OUT/'car-6.png',target=(0,0,.19),span=1.02)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'car-6.blend'),compress=True)
p=WEB/'manifest.json';m=json.loads(p.read_text());m['models']=[a for a in m['models'] if a['file']!='car-6.glb'];m['models'].append({'kind':'car','file':'car-6.glb','source':'artifacts/actors/car-6.blend','triangles':count,'bytes':(WEB/'car-6.glb').stat().st_size,'vehicle':'yellow-taxi'});p.write_text(json.dumps(m,indent=2))
p=ROOT/'public/models/living-city/manifest.json';m=json.loads(p.read_text());m['actorFiles']=[a for a in m['actorFiles'] if a!='car-6']+['car-6'];p.write_text(json.dumps(m,indent=2))
print('TAXI_COMPLETE',count)
