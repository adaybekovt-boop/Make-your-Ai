"""Создай 3D объект в Blender: detailed rack family, all parts exportable."""
import bpy,sys,json,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from blender_common import *
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/racks/v2';WEB=ROOT/'public/models/racks';OUT.mkdir(parents=True,exist_ok=True)
manifest={'source':'tools/build_equipment.py','units':'metres, +Y up, full proportions','chipMaterial':'chip_indicator','triangleBudget':2200,'models':[]}
for k,h,slots in [('rack-basic',.86,4),('rack-cooled',1.04,6),('rack-enterprise',1.18,8)]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 shell=mat('rack_shell',(.085,.13,.16),.55,.35);frame=mat('rack_frame',(.025,.04,.05),.45,.4);metal=mat('rack_alloy',(.40,.50,.53),.75,.25);led=mat('chip_indicator',(.14,.78,.65),0,.3,1.4);copper=mat('copper',(.59,.27,.09),.65,.35)
 cube('Cast base',(0,0,.06),(.76,.66,.12),frame,.025)
 cube('Left enclosure',(-.34,0,h/2+.06),(.065,.59,h),shell,.018);cube('Right enclosure',(.34,0,h/2+.06),(.065,.59,h),shell,.018);cube('Rear enclosure',(0,.28,h/2+.06),(.62,.045,h),frame)
 cube('Chamfered top',(0,0,h+.09),(.77,.67,.07),shell,.025)
 for x in [-.31,.31]:
  cube('Front mounting rail',(x,-.30,h/2+.055),(.035,.04,h-.05),metal)
  for z in [.15,h]:cylinder('Mounting bolt',(x,-.329,z),.016,.008,metal,8,(math.pi/2,0,0))
 static=list(bpy.context.scene.objects)
 # Distinct slide-out compute units with handles, front IO, vents and status LEDs.
 for i in range(slots):
  z=.17+i*(h-.16)/slots
  cube('Compute cartridge',(0,-.03,z),(.56,.52,.07),shell,.009)
  for x in [-.23,.23]:cube('Pull handle',(x,-.325,z),(.055,.04,.025),metal,0)
  for v in range(5):cube('Vent slot',(-.13+v*.039,-.298,z),(.018,.007,.037),frame)
  cube('Ethernet port',(.16,-.301,z),(.043,.009,.032),copper)
  cube('Status LED',(.22,-.312,z+.024),(.025,.008,.009),led)
 if k!='rack-basic':
  for x in [-.16,.16]:
   cylinder('Fan bezel',(x,0,h+.14),.125,.035,frame,16)
   cylinder('Fan hub',(x,0,h+.166),.026,.016,metal,10)
   for i in range(5):
    a=i*math.tau/5;o=cube('Fan blade',(x+math.cos(a)*.065,math.sin(a)*.065,h+.17),(.08,.03,.009),metal);o.rotation_euler.z=a+.35
 if k=='rack-enterprise':
  for x in [-.39,.39]:
   line('Coolant pipe',[(x,.16,.14),(x,.16,h),(x,0,h+.1)],.027,copper)
  cube('Control display',(0,-.319,h+.03),(.2,.015,.04),led,.005)
 # Static chassis stays visible when empty; compute modules can be hidden by the renderer.
 static_names={o.name for o in static};modules=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in static_names]
 join(modules,'compute_modules');join([o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='compute_modules'],'rack_chassis')
 count=triangles();assert count<2200,count
 bpy.ops.export_scene.gltf(filepath=str(WEB/(k+'.glb')),export_format='GLB',export_cameras=False,export_lights=False)
 preview(OUT/(k+'.png'),target=(0,0,.5),span=2.2);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(k+'.blend')),compress=True)
 manifest['models'].append({'file':k+'.glb','triangles':count,'height':h+.2,'width':.82,'bytes':(WEB/(k+'.glb')).stat().st_size,'source':'artifacts/racks/v2/'+k+'.blend'})
(WEB/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
