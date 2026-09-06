"""Создай 3D объект в Blender: black and silver urban shuttle, reference front/rear."""
import bpy,math,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent));from blender_common import *
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/actors';WEB=ROOT/'public/models/actors'
bpy.ops.wm.read_factory_settings(use_empty=True)
paint=mat('Black enamel',(.022,.029,.037),.65,.28);silver=mat('Brushed silver',(.48,.54,.58),.75,.32);glass=mat('Tinted glazing',(.065,.13,.16),.4,.22);dark=mat('Rubber',(.012,.017,.02),0,.7);led=mat('Daytime LED',(.8,.91,1),.2,.3,.8);red=mat('Rear strip',(.68,.02,.025),.2,.3,.7);amber=mat('Side markers',(.95,.36,.025),.2,.3,.5)
cube('Monocoque',(0,0,.29),(.36,1.12,.40),paint,.035)
cube('Roof cap',(0,0,.508),(.35,1.07,.044),silver,.021)
cube('Windshield',(0,-.563,.375),(.302,.016,.215),glass,.012)
cube('Destination display',(0,-.575,.465),(.185,.008,.03),dark,.004)
text('Route number','CITY 01',(0,-.581,.458),.016,led)
cube('Rear glass',(0,.559,.395),(.294,.015,.16),glass,.012)
cube('Rear light band',(0,.574,.258),(.295,.01,.018),red,.006)
cube('Rear bumper',(0,.572,.125),(.325,.018,.027),dark,.007)
cube('Front intake',(0,-.58,.147),(.22,.011,.027),dark,.005)
cube('Front bumper',(0,-.579,.112),(.331,.032,.02),silver,.007)
for side in [-1,1]:
 cube('Upper window trim',(side*.183,0,.491),(.009,1.015,.025),silver,.003)
 for y in [-.39,-.19,.01,.21,.41]:
  cube('Passenger window',(side*.184,y,.378),(.009,.178,.181),glass,.006)
  cube('Window mullion',(side*.191,y+.092,.378),(.011,.012,.19),paint)
  cube('Window reflection',(side*.190,y,.439),(.002,.152,.004),silver)
  cube('Lower access seam',(side*.184,y,.192),(.003,.002,.15),dark)
 for y in [-.35,.35]:
  cylinder('Tyre',(side*.182,y,.105),.101,.041,dark,20,(0,math.pi/2,0))
  cylinder('Wheel rim',(side*.207,y,.105),.073,.008,silver,20,(0,math.pi/2,0))
  cylinder('Wheel dish',(side*.212,y,.105),.058,.01,dark,16,(0,math.pi/2,0))
  cylinder('Hub cap',(side*.22,y,.105),.027,.012,silver,12,(0,math.pi/2,0))
  for k in range(8):
   a=k*math.tau/8;cylinder('Wheel bolt',(side*.222,y+.041*math.cos(a),.105+.041*math.sin(a)),.004,.005,silver,6,(0,math.pi/2,0))
  line('Arch trim',[(side*.19,y+math.cos(k*math.pi/16)*.11,.105+math.sin(k*math.pi/16)*.11) for k in range(17)],.008,paint)
 line('Mirror arm',[(side*.155,-.52,.465),(side*.233,-.59,.465),(side*.241,-.60,.429)],.009,silver)
 cube('Mirror housing',(side*.243,-.60,.393),(.036,.032,.092),paint,.013)
 cube('Mirror face',(side*.244,-.582,.393),(.025,.003,.07),silver,.005)
 cube('Headlight housing',(side*.12,-.574,.213),(.093,.014,.037),silver,.008)
 cube('Headlight lens',(side*.12,-.584,.217),(.071,.006,.019),glass,.004)
 cube('Running light',(side*.12,-.589,.202),(.068,.005,.004),led)
 for y in [-.46,-.06,.46]:cube('Marker',(side*.192,y,.18),(.008,.019,.009),amber,.003)
# Front passenger door; slim seals and lower glazing distinguish it from fixed windows.
cube('Entry door',( .191,-.428,.284),(.011,.148,.332),silver,.004)
for z,h in [(.37,.155),(.205,.115)]:cube('Door glass',(.199,-.428,z),(.004,.128,h),glass,.004)
cube('Door handle',(.204,-.37,.278),(.007,.01,.032),dark,.002)
for x in [-.075,.075]:
 line('Windshield wiper',[(x,-.581,.275),(x+.048,-.588,.306),(x+.071,-.588,.361)],.003,dark)
 cube('Exhaust',(x,.583,.112),(.035,.012,.018),silver,.004)
cube('Roof HVAC',(0,-.11,.555),(.26,.38,.057),paint,.021)
for y in [-.23,-.20,-.17,-.14,-.11,-.08,-.05,-.02]:cube('HVAC vent',(0,y,.586),(.17,.009,.003),dark)
cube('Roof hatch',(0,.30,.535),(.20,.20,.014),paint,.007)
batch_materials();count=triangles();assert count<6000,count
bpy.ops.export_scene.gltf(filepath=str(WEB/'car-5.glb'),export_format='GLB',export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7)
preview(OUT/'car-5.png',target=(0,0,.28),span=1.55)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'car-5.blend'),compress=True)
p=WEB/'manifest.json';m=json.loads(p.read_text());m['models']=[a for a in m['models'] if a['file']!='car-5.glb'];m['models'].append({'kind':'car','file':'car-5.glb','source':'artifacts/actors/car-5.blend','triangles':count,'bytes':(WEB/'car-5.glb').stat().st_size,'vehicle':'urban-bus'});p.write_text(json.dumps(m,indent=2))
p=ROOT/'public/models/living-city/manifest.json';m=json.loads(p.read_text());m['actorFiles']=[a for a in m['actorFiles'] if a!='car-5']+['car-5'];p.write_text(json.dumps(m,indent=2))
print('BUS_COMPLETE',count)
