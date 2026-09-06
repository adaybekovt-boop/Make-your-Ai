"""Создай 3D объект в Blender: integrated widebody coupe, surface-led automotive modelling."""
import bpy,bmesh,math,json,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent));from blender_common import mat,cube,cylinder,line,join,triangles
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/actors/hero-coupe';OUT.mkdir(parents=True,exist_ok=True);WEB=ROOT/'public/models/actors'
bpy.ops.wm.read_factory_settings(use_empty=True)
paint=mat('Obsidian clearcoat',(.017,.020,.026),.72,.23);paint.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=.55
rubber=mat('Satin trim and tyres',(.009,.011,.014),.04,.64);glass=mat('Dark automotive glass',(.023,.041,.050),.42,.13);chrome=mat('Dark machined alloy',(.18,.21,.24),.86,.23);led=mat('Headlight halo',(.73,.84,.92),.4,.2,.5);red=mat('Tail LED',(.38,.006,.011),.3,.23,.45);brake=mat('Brake disc',(.18,.19,.20),.72,.5)
materials=[paint,rubber,glass,chrome,led,red,brake]
def mesh(name,v,f,mids=None):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 for m in materials:me.materials.append(m)
 for i,p in enumerate(me.polygons):p.material_index=mids[i] if mids else 0;p.use_smooth=True
 return o
def bevel(o,width=.015,segments=3):
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=width;mod.segments=segments;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def box(name,pos,size,m,r=.01):return bevel(cube(name,pos,size,m),r) if r else cube(name,pos,size,m)
def interp(points,samples=3):
 out=[]
 for i in range(len(points)-1):
  p0=points[max(i-1,0)];p1=points[i];p2=points[i+1];p3=points[min(i+2,len(points)-1)]
  for j in range(samples):
   t=j/samples;out.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t) for a,b,c,d in zip(p0,p1,p2,p3)))
 return out+[points[-1]]
# Long hood, broad haunches, short rear deck. Physical dimensions in metres.
profiles=interp([(-2.47,.83,.29,.78),(-2.35,.98,.24,.89),(-1.65,1.00,.24,.98),(-.82,.985,.25,1.01),(.05,.98,.25,1.025),(1.43,1.035,.26,1.015),(2.25,.995,.30,.99),(2.44,.88,.33,.92)],5)
v=[];f=[]
for y,w,bot,top in profiles:
 # Ten-point rounded shoulder, almost flat door surface, smoothly crowned bonnet.
 half=[(0,bot),(.78*w,bot),(.96*w,bot+.04),(w,bot+.14),(w,top-.16),(.98*w,top-.055),(.93*w,top-.008),(.72*w,top+.018),(.37*w,top+.028),(0,top+.031)]
 ring=half+ [(-x,z) for x,z in half[-2:0:-1]]
 v.extend((x,y,z) for x,z in ring)
N=18
for j in range(len(profiles)-1):
 for k in range(N):f.append((j*N+k,j*N+(k+1)%N,(j+1)*N+(k+1)%N,(j+1)*N+k))
f += [tuple(range(N-1,-1,-1)),tuple(range((len(profiles)-1)*N,len(profiles)*N))]
body=mesh('Continuous sculpted body',v,f)
for y in [-1.52,1.48]:
 cutter=cylinder('Wheel arch cutter',(0,y,.39),.442,3,rubber,48,(0,math.pi/2,0));bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Real wheel opening','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE';mod.solver='EXACT';bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
bevel(body,.006,2)
# One cabin surface: painted roof and C pillars share vertices with inset glazing.
sections=[(-1.04,.89,.85,1.02,1.04),(-.52,.91,.745,1.024,1.435),(-.31,.91,.738,1.03,1.475),(.45,.92,.744,1.035,1.465),(.70,.915,.755,1.03,1.425),(1.31,.89,.86,1.028,1.05)]
v=[];f=[];mi=[]
for y,lo,hi,z0,z1 in sections:
 v.extend([(-lo,y,z0),(-hi,y,z1-.018),(-hi*.76,y,z1+.009),(0,y,z1+.021),(hi*.76,y,z1+.009),(hi,y,z1-.018),(lo,y,z0)])
for j in range(len(sections)-1):
 for k in range(6):
  f.append((j*7+k,(j+1)*7+k,(j+1)*7+k+1,j*7+k+1))
  mi.append(2 if ((j in [0,4] and k in [1,2,3,4]) or (j in [0,1,2,3] and k in [0,5])) else 0)
f += [tuple(range(6,-1,-1)),tuple(range(35,42))];mi += [0,0]
cabin=mesh('Integrated roof and glazing',v,f,mi)
# Thin window seals lie directly on the body rather than floating above it.
for side in [-1,1]:
 line('A pillar',[(side*.89,-1.04,1.039),(side*.745,-.52,1.423)],.017,paint)
 line('Roof side rail',[(side*.745,-.52,1.423),(side*.738,-.31,1.457),(side*.744,.45,1.447),(side*.755,.70,1.407)],.015,paint)
 line('Window sill',[(side*.895,-1.01,1.037),(side*.924,.45,1.047),(side*.917,.70,1.04)],.010,rubber)
 line('B pillar',[(side*.918,.30,1.044),(side*.748,.30,1.457)],.014,rubber)
 # Door contour and small flush handles.
 line('Door gap',[(side*.984,-.80,.98),(side*.995,-.74,.41),(side*.995,.54,.41),(side*.999,.67,.92),(side*.97,.65,1.016)],.0027,rubber)
 box('Door handle',(side*.991,.45,.928),(.014,.16,.025),paint,.01)
 stalk=box('Mirror stalk',(side*.965,-.72,1.05),(.15,.035,.035),rubber,.013)
 box('Mirror housing',(side*1.065,-.72,1.09),(.20,.24,.105),paint,.045)
 box('Mirror glass',(side*1.067,-.59,1.09),(.15,.008,.071),chrome,.018)
 # Side rocker and wide fender lips follow actual circular cut-outs.
 line('Rocker lip',[(side*.985,-1.03,.285),(side*1.00,.99,.285)],.018,paint)
 for y in [-1.52,1.48]:
  line('Wheel arch lip',[(side*1.014,y+.444*math.cos(a),.39+.444*math.sin(a)) for a in [k*math.pi/32 for k in range(33)]],.012,paint)
  tyre=bevel(cylinder('Tyre',(side*.982,y,.39),.39,.235,rubber,48,(0,math.pi/2,0)),.028,3)
  for p in tyre.data.polygons:p.use_smooth=True
  outer=side*1.106
  cylinder('Rim barrel',(outer,y,.39),.286,.012,chrome,40,(0,math.pi/2,0));cylinder('Rim shadow',(outer+side*.008,y,.39),.258,.012,rubber,40,(0,math.pi/2,0))
  cylinder('Brake rotor',(outer+side*.011,y,.39),.218,.012,brake,32,(0,math.pi/2,0))
  for k in range(10):
   a=k*math.tau/10;line('Split spoke',[(outer+side*.021,y+.065*math.cos(a),.39+.065*math.sin(a)),(outer+side*.024,y+.15*math.cos(a+.05),.39+.15*math.sin(a+.05)),(outer+side*.022,y+.264*math.cos(a+.13),.39+.264*math.sin(a+.13))],.009,chrome)
  cylinder('Centre cap',(outer+side*.026,y,.39),.055,.012,chrome,16,(0,math.pi/2,0))
  for k in range(5):
   a=k*math.tau/5;cylinder('Lug',(outer+side*.032,y+.076*math.cos(a),.39+.076*math.sin(a)),.008,.01,chrome,6,(0,math.pi/2,0))
# Recessed full-width front fascia with four round optics.
box('Front recessed grille',(0,-2.466,.72),(1.66,.022,.235),rubber,.08)
for x in [-.67,-.405,.405,.67]:
 cylinder('Optic bezel',(x,-2.488,.744),.099,.014,chrome,32,(math.pi/2,0,0));cylinder('Optic glass',(x,-2.502,.744),.085,.012,glass,32,(math.pi/2,0,0))
 line('Halo ring',[(x+.088*math.cos(k*math.tau/40),-2.513,.744+.088*math.sin(k*math.tau/40)) for k in range(41)],.006,led)
for z in [.70,.74,.78]:box('Grille mesh horizontal',(0,-2.491,z),(.48,.003,.004),chrome,.001)
for x in [-.2,-.15,-.1,-.05,0,.05,.1,.15,.2]:box('Grille mesh vertical',(x,-2.492,.74),(.003,.003,.11),chrome,.001)
box('Lower intake',(0,-2.467,.40),(1.45,.022,.17),rubber,.055)
box('Front splitter',(0,-2.45,.283),(1.88,.20,.026),rubber,.012)
for x in [-.36,.36]:
 box('Bonnet intake surround',(x,-1.58,1.015),(.28,.40,.016),paint,.04)
 box('Bonnet intake recess',(x,-1.67,1.027),(.205,.16,.006),rubber,.025)
line('Bonnet panel left',[(-.80,-2.22,.956),(-.78,-1.20,1.041),(-.70,-1.04,1.05)],.002,rubber)
line('Bonnet panel right',[(.80,-2.22,.956),(.78,-1.20,1.041),(.70,-1.04,1.05)],.002,rubber)
box('Rear black fascia',(0,2.442,.78),(1.68,.025,.23),rubber,.065)
for x in [-.46,.46]:
 line('Rear LED perimeter',[(x+dx,2.461,.78+dz) for dx,dz in [(-.31,-.065),(.31,-.065),(.345,-.03),(.345,.03),(.31,.065),(-.31,.065),(-.345,.03),(-.345,-.03),(-.31,-.065)]],.013,red)
box('Ducktail spoiler',(0,2.14,1.086),(1.91,.29,.038),paint,.017)
for x in [-.65,.65]:
 box('Exhaust outlet',(x,2.443,.355),(.31,.08,.12),chrome,.035);box('Exhaust interior',(x,2.488,.355),(.245,.01,.075),rubber,.025)
box('Rear diffuser',(0,2.42,.292),(1.56,.18,.04),rubber,.018)
for x in [-.35,0,.35]:box('Diffuser fin',(x,2.39,.315),(.013,.24,.095),rubber,.005)
# Smooth surfaces, crisp manufactured components, then shared materials for runtime batching.
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and o not in [body,cabin] and not o.name.startswith(('Tyre','Rim','Optic','Brake','Centre')):
  mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
# Save the physical-scale editable master; web model uses the established city unit scale.
s=bpy.context.scene;s.world=bpy.data.worlds.new('Automotive studio');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.19,.23,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.65
for name,pos,power,size,sy in [('Key',(-4,-5,7),1500,6,2),('Rim',(4,3,6),2100,6,1),('Front',(2,-6,3),650,4,3)]:
 ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.shape='RECTANGLE';ld.size=size;ld.size_y=sy;o=bpy.data.objects.new(name,ld);s.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
cd=bpy.data.cameras.new('Three quarter front');cam=bpy.data.objects.new('Three quarter front',cd);s.collection.objects.link(cam);s.camera=cam;cam.location=(7,-9,4.6);cam.rotation_euler=(Vector((0,0,.68))-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=6.5
s.render.engine='CYCLES';s.cycles.samples=48;s.cycles.use_denoising=True;s.render.resolution_x=1500;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.render.filepath=str(OUT/'front.png');bpy.ops.render.render(write_still=True)
cam.location=(-7,9,4.1);cam.rotation_euler=(Vector((0,0,.68))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(OUT/'rear.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'coupe-master.blend'),compress=True)
from blender_common import batch_materials
batch_materials()
for o in list(s.objects):
 if o.type=='MESH':
  for v in o.data.vertices:v.co*=.142
  o.location*=.142
bpy.ops.object.select_all(action='DESELECT')
for o in s.objects:
 if o.type=='MESH':o.select_set(True)
count=triangles();bpy.ops.export_scene.gltf(filepath=str(OUT/'car-4.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,export_draco_position_quantization=16)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'car-4.blend'),compress=True)
(OUT/'budget.json').write_text(json.dumps({'triangles':count,'bytes':(OUT/'car-4.glb').stat().st_size},indent=2));print('HERO_COMPLETE',count)
