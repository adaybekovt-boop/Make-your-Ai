"""Создай 3D объект в Blender: three pedestrians and three vehicles with reusable joints."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent));from blender_common import *
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/actors';WEB=ROOT/'public/models/actors';OUT.mkdir(exist_ok=True);WEB.mkdir(parents=True,exist_ok=True)
manifest={'builder':'tools/build_actors.py','models':[]}
def vertex_batch(obs,name,pivot=(0,0,0)):
 for ob in obs:
  col=ob.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  for poly in ob.data.polygons:
   m=ob.data.materials[poly.material_index];rgba=m.diffuse_color
   for li in poly.loop_indices:col.data[li].color=rgba
  ob.data.color_attributes.active_color=col
 obj=join(obs,name);obj.data.materials.clear();obj.data.materials.append(vertexmat)
 for p in obj.data.polygons:p.material_index=0
 bpy.context.scene.cursor.location=pivot;bpy.ops.object.origin_set(type='ORIGIN_CURSOR');obj['joint']=name;return obj
for kind in ['person','car']:
 for variant in range(3):
  bpy.ops.wm.read_factory_settings(use_empty=True)
  vertexmat=mat('Actor vertex palette',(1,1,1),.15,.6);node=vertexmat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='Color';vertexmat.node_tree.links.new(node.outputs['Color'],vertexmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
  dark=mat('Graphite',(.035,.052,.065));light=mat('Ivory',(.8,.81,.72));steel=mat('Alloy',(.34,.43,.46),.5,.3);glass=mat('Blue glass',(.06,.17,.22),.3,.2)
  color=mat('Clothing' if kind=='person' else 'Paint',[(.20,.43,.44),(.69,.34,.16),(.35,.37,.58)][variant],.25,.45)
  skin=mat('Skin',[(.65,.42,.27),(.34,.18,.10),(.82,.59,.39)][variant]);hair=mat('Hair',[(.09,.06,.04),(.035,.025,.022),(.27,.14,.055)][variant]);lamp=mat('Headlights',(.94,.82,.53));tail=mat('Tail lights',(.65,.08,.04))
  if kind=='person':
   # Model is about 0.3 city units tall, with its feet on the route surface.
   h=.30*(1+variant*.025)
   cube('Torso',(0,0,.18),(.095,.058,.115),color,.015)
   cylinder('Neck',(0,0,.25),.018,.026,skin,8)
   bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.034,location=(0,-.003,.277));bpy.context.object.scale=(.83,.9,1.1);bpy.context.object.data.materials.append(skin)
   cube('Hair cap',(0,.003,.301),(.054,.05,.022),hair,.009)
   cube('Nose',(0,-.036,.28),(.012,.012,.013),skin,.003)
   if variant==0:
    cube('Backpack',(0,.039,.194),(.065,.035,.076),dark,.01)
   if variant==1:
    cylinder('Beanie',(0,0,.315),.033,.025,color,10)
   if variant==2:
    cube('Jacket shirt',(0,-.032,.204),(.026,.008,.052),light)
   vertex_batch([o for o in bpy.context.scene.objects if o.type=='MESH'],'body')
   for side,x in [('l',-.064),('r',.064)]:
    before=set(bpy.context.scene.objects)
    cube('Sleeve',(x,0,.20),(.033,.042,.079),color,.01);cube('Hand',(x,-.004,.149),(.027,.031,.035),skin,.007)
    vertex_batch([o for o in bpy.context.scene.objects if o not in before],'arm_'+side,(x,0,.235))
   for side,x in [('l',-.026),('r',.026)]:
    before=set(bpy.context.scene.objects)
    cube('Trousers',(x,0,.08),(.039,.047,.11),dark,.009);cube('Shoe',(x,-.012,.018),(.046,.068,.027),light if variant==0 else dark,.007)
    vertex_batch([o for o in bpy.context.scene.objects if o not in before],'leg_'+side,(x,0,.132))
   # The .blend and .glb contain a real looping walk clip, as well as reusable pivots.
   for o in list(bpy.context.scene.objects):
    if o.name.startswith(('arm_','leg_')):
     phase=1 if o.name in ['arm_l','leg_r'] else -1
     for f,a in [(1,0),(7,.42),(13,0),(19,-.42),(25,0)]:o.rotation_euler.x=a*phase;o.keyframe_insert(data_path='rotation_euler',frame=f)
   bpy.context.scene.frame_end=25;bpy.context.scene.render.fps=24;bpy.context.scene.frame_set(1)
  else:
   length=[.57,.69,.63][variant]
   cube('Underbody',(0,0,.093),(.25,length,.075),dark,.025);cube('Painted body',(0,0,.15),(.28,length,.115),color,.035)
   cube('Glass cabin',(0,.035,.225),(.235,length*.49,.105),glass,.028);cube('Floating roof',(0,.055,.285),(.225,length*.43,.025),color,.018)
   if variant==1:cube('Delivery cargo box',(0,.15,.23),(.275,.34,.22),light,.018)
   for x in [-.13,.13]:
    cube('Door pillar',(x,.06,.231),(.012,.028,.1),color)
    cube('Mirror',(x*1.18,-.13,.22),(.037,.043,.025),color,.007)
    cube('Door handle',(x*1.05,.04,.17),(.014,.065,.015),steel)
   cube('Front grille',(0,-length/2-.004,.123),(.115,.014,.034),dark)
   for x in [-.092,.092]:cube('Headlight',(x,-length/2-.005,.17),(.061,.015,.025),lamp,.005);cube('Tail light',(x,length/2+.005,.17),(.052,.015,.028),tail,.004)
   vertex_batch([o for o in bpy.context.scene.objects if o.type=='MESH'],'body')
   for x in [-.143,.143]:
    for y in [-length*.3,length*.3]:
     before=set(bpy.context.scene.objects);cylinder('Tyre',(x,y,.075),.065,.031,dark,12,(0,math.pi/2,0));cylinder('Wheel alloy',(x*1.12,y,.075),.035,.006,steel,8,(0,math.pi/2,0));vertex_batch([o for o in bpy.context.scene.objects if o not in before],'wheel_'+str(len(bpy.context.scene.objects)),(x,y,.075))
  filename=f'{kind}-{variant+1}';count=triangles();assert count<2500,count
  bpy.ops.export_scene.gltf(filepath=str(WEB/(filename+'.glb')),export_format='GLB',export_animations=True,export_cameras=False,export_lights=False,export_extras=True)
  preview(OUT/(filename+'.png'),target=(0,0,.15),span=.9 if kind=='person' else 1.2)
  bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(filename+'.blend')),compress=True)
  manifest['models'].append({'kind':kind,'file':filename+'.glb','source':'artifacts/actors/'+filename+'.blend','triangles':count,'bytes':(WEB/(filename+'.glb')).stat().st_size})
  (WEB/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
