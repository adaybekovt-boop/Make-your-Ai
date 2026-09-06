"""Создай 3D объект в Blender: six people using the supplied outfit/silhouette references."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent));from blender_common import *
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/actors';WEB=ROOT/'public/models/actors'
old=json.loads((WEB/'manifest.json').read_text(encoding='utf8'));manifest={'builder':'tools/build_reference_people.py + tools/build_actors.py','models':[m for m in old['models'] if m['kind']=='car']}
S=.18
for variant,label in enumerate(['Denim shirt and chinos','Blue shirt and sand trousers','Navy suit and white shirt','Black top and blue jeans','White blouse and navy skirt','Graphic top and pleated skirt']):
 bpy.ops.wm.read_factory_settings(use_empty=True);female=variant>=3
 palette=mat('Pedestrian vertex palette',(1,1,1),.05,.8);vc=palette.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';palette.node_tree.links.new(vc.outputs['Color'],palette.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
 skin=mat('Skin',(.69,.45,.31) if not female else (.79,.55,.40));hair=mat('Hair',(.07,.042,.025) if variant<3 else (.48,.34,.15) if variant==3 else (.16,.075,.034) if variant==4 else (.08,.035,.03))
 shirt=mat('Shirt',[(.23,.44,.58),(.08,.34,.48),(.025,.042,.085),(.014,.02,.025),(.79,.82,.78),(.021,.022,.041)][variant]);pants=mat('Trousers',(.43,.28,.12) if variant<2 else (.02,.034,.065) if variant in [2,4,5] else (.13,.27,.35));shoe=mat('Shoes',(.06,.036,.022) if variant<2 else (.02,.024,.026));white=mat('Light fabric',(.88,.88,.78));black=mat('Features',(.027,.020,.018));accent=mat('Print accent',(.53,.29,.72));buckle=mat('Metal',(.49,.50,.45),.6,.4)
 def block(name,pos,size,m,bevel=.005):return cube(name,tuple(a*S for a in pos),tuple(a*S for a in size),m,bevel*S)
 def ellipsoid(name,pos,size,m,segments=12,rings=6):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=tuple(a*S for a in pos));o=bpy.context.object;o.name=name;o.scale=tuple(a*S for a in size);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
  for p in o.data.polygons:p.use_smooth=True
  return o
 def loft(name,rings,m,segments=8):
  # Elliptical tailored sections: (z, half width, half depth, x, y).
  vs=[];faces=[]
  for z,rx,ry,x,y in rings:
   for i in range(segments):
    a=math.tau*i/segments;vs.append(((x+rx*math.cos(a))*S,(y+ry*math.sin(a))*S,z*S))
  for j in range(len(rings)-1):
   for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
  faces.extend([tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+i for i in range(segments))]);me=bpy.data.meshes.new(name);me.from_pydata(vs,[],faces);me.materials.append(m);o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return o
 def batch(obs,name,pivot=(0,0,0)):
  for o in obs:
   at=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
   for p in o.data.polygons:
    rgba=o.data.materials[p.material_index].diffuse_color
    for li in p.loop_indices:at.data[li].color=rgba
   o.data.color_attributes.active_color=at
  obj=join(obs,name);obj.data.materials.clear();obj.data.materials.append(palette)
  for p in obj.data.polygons:p.material_index=0
  bpy.context.scene.cursor.location=tuple(a*S for a in pivot);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');obj['joint']=name;return obj
 waist=.14 if female else .17;shoulder=.205 if female else .23
 if variant in [3,5]:
  loft('Midriff',[(.86,waist,.095,0,0),(1.02,waist,.095,0,0),(1.01,waist,.095,0,0)],skin)
  bottom=1.01
 else:bottom=.88
 loft('Tailored torso',[(bottom,waist,.10,0,0),(1.12,waist*.97,.11,0,0),(1.32,shoulder,.115,0,0),(1.40,shoulder*.89,.10,0,0),(1.44,.085,.075,0,0)],shirt)
 loft('Collar neck',[(1.40,.063,.055,0,0),(1.49,.062,.053,0,0)],skin)
 ellipsoid('Head',(0,-.004,1.60),(.105,.095,.14),skin,16,8)
 ellipsoid('Left ear',(-.108,0,1.59),(.018,.019,.032),skin,8,4);ellipsoid('Right ear',(.108,0,1.59),(.018,.019,.032),skin,8,4)
 ellipsoid('Nose',(0,-.094,1.59),(.018,.023,.031),skin,8,4)
 for x in [-.039,.039]:
  ellipsoid('Eye',(x,-.091,1.625),(.012,.005,.007),black,8,4)
  block('Eyebrow',(x,-.088,1.647),(.028,.008,.009),hair,.003)
 block('Mouth',(0,-.093,1.555),(.037,.005,.006),hair,.001)
 ellipsoid('Hair crown',(0,.018,1.709),(.106,.084,.053),hair,12,5)
 if not female:
  ellipsoid('Swept fringe',(.025,-.036,1.73),(.10,.065,.042),hair,10,4)
  block('Beard jaw',(0,-.068,1.53),(.13,.046,.032),hair,.012)
  for x in [-.081,.081]:block('Sideburn',(x,-.034,1.575),(.019,.031,.09),hair,.004)
 else:
  # Separate side locks keep the face clear, with shoulder-length silhouettes.
  for x in [-.095,.095]:loft('Hair side lock',[(1.33,.046,.05,x,.038),(1.48,.045,.06,x,.033),(1.65,.041,.055,x,.021),(1.72,.025,.043,x*.65,.025)],hair)
  ellipsoid('Hair back',(0,.068,1.52),(.107,.05,.18),hair,12,5)
 if variant in [0,1,2,4]:
  # V collar, placket, buttons and cuffs make outfits readable beyond their colors.
  for sign in [-1,1]:
   o=block('Collar',(sign*.052,-.078,1.406),(.09,.018,.092),white if variant in [2,4] else shirt);o.rotation_euler.y=sign*.42
  block('Button placket',(0,-.112,1.20),(.018,.012,.37),white if variant==2 else shirt)
  for z in [1.08,1.18,1.28,1.38]:ellipsoid('Button',(0,-.123,z),(.006,.004,.006),white if variant<2 else buckle,6,3)
 if variant==2:
  for sign in [-1,1]:
   o=block('Suit lapel',(sign*.066,-.116,1.285),(.067,.012,.26),shirt);o.rotation_euler.y=sign*.32
  block('Pocket square',(.12,-.119,1.31),(.05,.012,.027),white)
 if variant==5:
  block('Graphic panel',(0,-.117,1.22),(.14,.01,.10),accent)
  for x in [-.055,0,.055]:ellipsoid('Printed star',(x,-.125,1.23),(.018,.006,.015),white,6,3)
  block('Shirt hem piping',(0,-.11,1.02),(.27,.013,.016),accent)
 if variant in [4,5]:
  rings=[(.62,.26,.15,0,0),(.82,.20,.115,0,0),(.98,waist+.015,.105,0,0)]
  skirt=loft('Pleated skirt',rings,pants,12)
 else:
  loft('Trouser waistband',[(.82,waist+.015,.10,0,0),(.94,waist+.01,.10,0,0)],pants)
  block('Belt buckle',(0,-.109,.917),(.04,.015,.028),buckle)
 body=batch([o for o in bpy.context.scene.objects if o.type=='MESH'],'body')
 for side,x in [('l',-shoulder- .025),('r',shoulder+.025)]:
  before=set(bpy.context.scene.objects);short=variant==5;rolled=variant in [0,1]
  loft('Upper sleeve',[(1.16,.048,.05,x,0),(1.34,.060,.06,x,0),(1.39,.038,.048,x,0)],shirt)
  loft('Forearm',[(.96,.032,.037,x,-.025),(1.08,.038,.043,x,-.005),(1.17,.045,.047,x,0)],skin if short or rolled else shirt)
  if rolled:block('Rolled cuff',(x,-.004,1.16),(.098,.10,.044),shirt,.015)
  ellipsoid('Hand',(x,-.03,.928),(.035,.028,.055),skin,8,5)
  batch([o for o in bpy.context.scene.objects if o not in before],'arm_'+side,(x,0,1.36))
 for side,x in [('l',-.085),('r',.085)]:
  before=set(bpy.context.scene.objects);m=skin if variant in [4,5] else pants
  loft('Upper leg',[(.43,.048,.048,x,0),(.55,.05,.052,x,.012),(.83,.076,.079,x,0),(.88,.073,.08,x,0)],m)
  upper=batch([o for o in bpy.context.scene.objects if o not in before],'leg_'+side,(x,0,.84))
  before=set(bpy.context.scene.objects)
  loft('Shin',[(.10,.045,.043,x,0),(.29,.043,.043,x,0),(.43,.048,.048,x,0)],m)
  block('Shoe',(x,-.04,.055),(.11,.22,.08),shoe,.018)
  block('Sole',(x,-.042,.022),(.112,.222,.018),white if variant==3 else black,.008)
  lower=batch([o for o in bpy.context.scene.objects if o not in before],'knee_'+side,(x,0,.43))
  bpy.context.view_layer.update();world=lower.matrix_world.copy();lower.parent=upper;lower.matrix_world=world
 for o in bpy.context.scene.objects:
  if o.name.startswith(('arm_','leg_','knee_')):
   phase=1 if o.name in ['arm_l','leg_r'] else -1
   for f,a in [(1,0),(7,.33),(13,0),(19,-.33),(25,0)]:
    o.rotation_euler.x=max(0,-a*phase)*1.4 if o.name.startswith('knee_') else a*phase;o.keyframe_insert(data_path='rotation_euler',frame=f)
 bpy.context.scene.frame_end=25;bpy.context.scene.render.fps=24;bpy.context.scene.frame_set(1)
 count=triangles();assert count<3500,count
 file=f'person-{variant+1}'
 bpy.ops.export_scene.gltf(filepath=str(WEB/(file+'.glb')),export_format='GLB',export_animations=True,export_cameras=False,export_lights=False,export_extras=True)
 preview(OUT/(file+'.png'),target=(0,0,.15),span=.62)
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(file+'.blend')),compress=True)
 manifest['models'].append({'kind':'person','file':file+'.glb','source':'artifacts/actors/'+file+'.blend','reference':variant+1,'description':label,'triangles':count,'bytes':(WEB/(file+'.glb')).stat().st_size})
 (WEB/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
p=ROOT/'public/models/living-city/manifest.json';m=json.loads(p.read_text(encoding='utf8'));m['actorFiles']=[f'person-{i}' for i in range(1,7)]+[f'car-{i}' for i in range(1,4)];p.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf8')
