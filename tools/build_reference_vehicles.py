"""Создай 3D объект в Blender: six reference-directed vehicles with curved shells and actual wheel arches."""
import bpy,bmesh,math,json,sys,shutil
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent));from blender_common import mat,cube,cylinder,line,text,batch_materials,triangles
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/actors/reference-v2';WEB=ROOT/'public/models/actors';OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads((WEB/'manifest.json').read_text())
def rounded(name,pos,size,m,r=.01,segments=3):
 o=cube(name,pos,size,m)
 if r:
  mod=o.modifiers.new('Rounded production edges','BEVEL');mod.width=r;mod.segments=segments;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  mod=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def shell(name,sections,m):
 verts=[]
 # Superellipse sections soften the shoulder without ballooning the flat side panels.
 for y,w,base,top in sections:
  for k in range(24):
   a=k*math.tau/24;ca=math.cos(a);sa=math.sin(a);verts.append((w*math.copysign(abs(ca)**.45,ca),y,(top+base)/2+(top-base)/2*math.copysign(abs(sa)**.45,sa)))
 faces=[tuple(range(23,-1,-1))]
 for j in range(len(sections)-1):
  for k in range(24):faces.append((j*24+k,j*24+(k+1)%24,(j+1)*24+(k+1)%24,(j+1)*24+k))
 faces.append(tuple(range((len(sections)-1)*24,len(sections)*24)))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(m)
 for p in me.polygons:p.use_smooth=True
 return o
for idx in [1,2,3,5,6]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 color={1:(.035,.27,.28),2:(.75,.75,.67),3:(.66,.13,.09),4:(.017,.022,.03),5:(.024,.031,.038),6:(1,.62,.005)}[idx]
 paint=mat('Paint',color,.5,.24);rubber=mat('Tyres and trim',(.012,.016,.021),.02,.7);glass=mat('Tinted glazing',(.065,.13,.16),.42,.17);alloy=mat('Machined alloy',(.40,.47,.50),.82,.22);lamp=mat('Headlight lens',(.78,.87,.91),.28,.19,.45);red=mat('Rear LED',(.60,.012,.021),.2,.26,.35)
 bus=idx==5;van=idx==2;coupe=idx==4;hatch=idx==3
 length=1.13 if bus else .72 if van or coupe else .64 if hatch else .69
 width=.184 if bus else .165 if van or coupe else .148
 radius=.092 if bus else .077 if coupe else .069
 axles=[-length*.30,length*.30];base=.075 if not bus else .09;top=.205 if not bus else .29
 body=shell('Continuous body panels',[(-length*.5,width*.86,base+.02,top-.045),(-length*.48,width*.97,base,top-.02),(-length*.36,width,base,top),(-length*.18,width,base,top+.006),(length*.14,width,base,top+.016),(length*.37,width,base,top+.007),(length*.48,width*.96,base+.004,top-.005),(length*.5,width*.87,base+.02,top-.025)],paint)
 # Boolean wheel openings through the shell: wheels no longer sit on top of solid side panels.
 for y in axles:
  cutter=cylinder('Wheel well cutter',(0,y,radius),radius*1.11,width*3,rubber,32,(0,math.pi/2,0));bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Wheel arch opening','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;mod.solver='EXACT';bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
 bevel=body.modifiers.new('Panel edge softness','BEVEL');bevel.width=.0025;bevel.segments=2;bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=bevel.name)
 if bus:
  rounded('Bus upper structure',(0,.02,.372),(width*2,length-.04,.245),paint,.032,4)
  rounded('Roof skin',(0,.02,.503),(width*1.94,length-.065,.026),alloy,.012)
  rounded('Windshield',(0,-length*.496,.38),(width*1.73,.014,.205),glass,.015)
  rounded('Rear glazing',(0,length*.492,.40),(width*1.72,.013,.15),glass,.012)
  for side in [-1,1]:
   for y in [-.40,-.20,0,.20,.40]:
    rounded('Passenger glazing',(side*(width+.002),y,.39),(.005,.182,.177),glass,.004)
   rounded('Upper silver belt',(side*(width+.004),0,.483),(.008,length-.10,.018),alloy,.004)
   line('Mirror arm',[(side*.16,-.49,.464),(side*.23,-.58,.464),(side*.237,-.58,.405)],.006,paint)
   rounded('Mirror housing',(side*.237,-.58,.387),(.026,.029,.075),paint,.009)
  rounded('Roof HVAC',(0,-.09,.538),(.25,.36,.053),paint,.02)
  for y in [-.20,-.17,-.14,-.11,-.08,-.05]:rounded('HVAC vent',(0,y,.566),(.18,.009,.004),rubber,.001)
  rounded('Entry door',(.19,-.424,.289),(.007,.139,.32),alloy,.003)
  for z,h in [(.38,.16),(.215,.11)]:rounded('Door glazing',(.195,-.424,z),(.004,.125,h),glass,.003)
 elif van:
  rounded('Cargo body',(0,.115,.273),(width*1.98,.47,.26),paint,.024,4)
  shell('Cabin',[(-.235,width*.94,.20,.218),(-.15,width*.87,.205,.362),(-.09,width*.86,.20,.392),(.005,width*.86,.21,.392),(.06,width*.93,.22,.31)],glass)
  rounded('Cab roof',(0,-.045,.393),(width*1.77,.16,.025),paint,.01)
  for side in [-1,1]:
   line('Cab front pillar',[(side*width*.94,-.235,.215),(side*width*.86,-.10,.384)],.007,paint)
   rounded('Cab rear pillar',(side*width*.90,.015,.305),(.017,.026,.175),paint,.007)
   line('Sliding door seam',[(side*(width+.002),.045,.16),(side*(width+.002),.045,.365),(side*(width+.002),.27,.365),(side*(width+.002),.27,.16)],.0011,rubber)
  line('Rear door seam',[(0,length*.498,.15),(0,length*.498,.365)],.0012,rubber)
 else:
  roof=.319 if not coupe else .298;rear=.19 if hatch else .235
  # A shared cabin mesh keeps roof, glass and pillars flush, without a separate roof slab.
  sections=[(-.15,width*.91,width*.89,.205,.22),(-.07,width*.95,width*.79,.213,roof-.012),(-.025,width*.96,width*.78,.215,roof),(.07,width*.97,width*.78,.216,roof+.002),(.13,width*.96,width*.80,.216,roof-.014),(rear,width*.91,width*.90,.209,.225)]
  cv=[];cf=[];cm=[]
  for y,lo,hi,low,high in sections:cv.extend([(-lo,y,low),(-hi,y,high-.002),(-hi*.75,y,high+.002),(0,y,high+.004),(hi*.75,y,high+.002),(hi,y,high-.002),(lo,y,low)])
  for j in range(5):
   for k in range(6):cf.append((j*7+k,(j+1)*7+k,(j+1)*7+k+1,j*7+k+1));cm.append(int((j in [0,4] and k in [1,2,3,4]) or (j in [0,1,2,3] and k in [0,5])))
  me=bpy.data.meshes.new('Integrated cabin');me.from_pydata(cv,[],cf);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();ob=bpy.data.objects.new('Integrated cabin',me);bpy.context.collection.objects.link(ob);me.materials.append(paint);me.materials.append(glass)
  for poly,mi in zip(me.polygons,cm):poly.material_index=mi;poly.use_smooth=not mi
  for side in [-1,1]:
   line('A pillar',[(side*width*.91,-.15,.219),(side*width*.79,-.07,roof-.009)],.0045,paint)
   line('Rear pillar',[(side*width*.80,.13,roof-.008),(side*width*.91,rear,.225)],.008,paint)
   line('B pillar',[(side*width*.96,.036,.215),(side*width*.78,.036,roof)],.004,rubber)
   line('Lower window seal',[(side*width*.95,-.13,.215),(side*width*.98,.13,.22),(side*width*.94,rear-.025,.222)],.0018,rubber)
   for y in ([.10] if coupe else [.008,.155]):
    rounded('Flush door handle',(side*(width+.001),y,.20),(.008,.032,.007),paint if idx!=6 else rubber,.003)
    line('Door seam',[(side*(width+.001),y+.034,.208),(side*(width+.001),y+.043,.115),(side*(width+.001),y-.078,.113)],.00065,rubber)
  if coupe:
   rounded('Rear spoiler',(0,length*.42,.234),(.31,.052,.009),paint,.004)
   for x in [-.09,.09]:rounded('Spoiler strut',(x,length*.42,.224),(.013,.018,.019),paint,.004)
   for x in [-.059,.059]:rounded('Hood inlet',(x,-.235,.209),(.047,.065,.006),rubber,.002)
  if idx==6:
   rounded('Taxi lantern',(0,.03,.356),(.137,.055,.059),paint,.012)
   text('Taxi sign','TAXI',(0,.001,.34),.032,rubber)
   for side in [-1,1]:
    for row in range(2):
     for k in range(16):
      if (row+k)%2==0:rounded('Taxi checker',(side*(width+.002),-.10+k*.016,.183+row*.012),(.001,.014,.01),rubber,0)
 for side in [-1,1]:
  if not bus:rounded('Mirror',(side*(width+.02),-.12,.244 if not van else .285),(.03,.042,.022),paint,.009)
  for y in axles:
   wheelx=side*(width-.005)
   tyre=cylinder('Tyre',(wheelx,y,radius),radius,.034,rubber,32,(0,math.pi/2,0));mod=tyre.modifiers.new('Rounded tyre shoulders','BEVEL');mod.width=.006;mod.segments=3;bpy.context.view_layer.objects.active=tyre;bpy.ops.object.modifier_apply(modifier=mod.name)
   for p in tyre.data.polygons:p.use_smooth=True
   outer=side*(width+.014);cylinder('Rim',(outer,y,radius),radius*.74,.004,alloy,24,(0,math.pi/2,0));cylinder('Dark inset',(outer+side*.002,y,radius),radius*.64,.004,rubber,24,(0,math.pi/2,0))
   for k in range(10):
    a=k*math.tau/10;line('Flush wheel spoke',[(outer+side*.005,y+radius*.16*math.cos(a),radius+radius*.16*math.sin(a)),(outer+side*.005,y+radius*.66*math.cos(a+.15),radius+radius*.66*math.sin(a+.15))],.0018,alloy)
   cylinder('Hub',(outer+side*.006,y,radius),radius*.16,.005,alloy,12,(0,math.pi/2,0))
  if coupe:
   for x in [.071,.112]:
    cylinder('Round headlight',(side*x,-length*.510,.173),.018,.005,lamp,24,(math.pi/2,0,0));cylinder('Lens inset',(side*x,-length*.516,.173),.012,.004,glass,20,(math.pi/2,0,0))
  else:
   light=rounded('Swept headlamp',(side*width*.70,-length*.510,.177 if not bus else .219),(width*.46,.018,.023),lamp,.009);light.rotation_euler.z=side*.22
  rounded('Rear lamp',(side*width*.70,length*.510,.184 if not bus else .265),(width*.50,.012,.023),red,.007)
  if bus or van:
   for y in [-length*.38,length*.38]:rounded('Marker',(side*(width+.007),y,.17),(.005,.015,.007),lamp,.002)
 rounded('Front intake',(0,-length*.495,.118),(width*1.4,.008,.026),rubber,.006)
 rounded('Grille',(0,-length*.497,.166),(width*.88,.008,.025),rubber,.005)
 for z in [.161,.172]:rounded('Grille strip',(0,-length*.503,z),(width*.81,.003,.002),alloy,.001)
 for y in [-length*.506,length*.506]:rounded('License plate',(0,y,.139),(.075,.004,.019),alloy,.002)
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH' and o.name.startswith('Continuous'):
   mod=o.modifiers.new('Panel normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 batch_materials();count=triangles();assert count<18000,(idx,count)
 bpy.ops.export_scene.gltf(filepath=str(WEB/f'car-{idx}.glb'),export_format='GLB',export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,export_draco_position_quantization=16)
 s=bpy.context.scene;s.world=bpy.data.worlds.new('Studio');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.28,.32,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.6
 for name,pos,power,size in [('Key',(-2,-3,4),500,4),('Rim',(3,2,4),650,3)]:
  ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.shape='RECTANGLE';ld.size=size;ld.size_y=size/2;o=bpy.data.objects.new(name,ld);s.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.2))-o.location).to_track_quat('-Z','Y').to_euler()
 cd=bpy.data.cameras.new('Vehicle presentation');cam=bpy.data.objects.new('Vehicle presentation',cd);s.collection.objects.link(cam);s.camera=cam;cam.location=(1.2,-1.6,.95);cam.rotation_euler=(Vector((0,0,.20))-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=1.48 if bus else 1.03
 s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=1200;s.render.resolution_y=850;s.render.resolution_percentage=100;s.render.filepath=str(OUT/f'car-{idx}.png');bpy.ops.render.render(write_still=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'car-{idx}.blend'),compress=True)
 entry=next(e for e in manifest['models'] if e['file']==f'car-{idx}.glb');entry.update(source=f'artifacts/actors/reference-v2/car-{idx}.blend',triangles=count,bytes=(WEB/f'car-{idx}.glb').stat().st_size,reference='artifacts/references/vehicle-lineup.png')
 (WEB/'manifest.json').write_text(json.dumps(manifest,indent=2));print('VEHICLE_COMPLETE',idx,count,flush=True)
