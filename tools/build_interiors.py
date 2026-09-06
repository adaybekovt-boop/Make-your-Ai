"""Создай 3D объект в Blender: authored, furnished dollhouse interiors v2."""
import bpy,math,json,sys,random
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from blender_common import *
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/interiors';WEB=ROOT/'public/models/interiors';OUT.mkdir(exist_ok=True);WEB.mkdir(parents=True,exist_ok=True)
manifest={'cameraElevation':22,'spacing':[1.3,2.25],'builder':'tools/build_interiors.py','models':[]}
for key,n in [('garage',3),('workshop',4),('technopark',5),('server-hall',6),('campus',8),('hq',0),('dc-north',8),('dc-south',8)]:
 bpy.ops.wm.read_factory_settings(use_empty=True);random.seed(17)
 industrial=key in ['server-hall','dc-north','dc-south'];premium=key in ['campus','hq'];w=max(6.6,n*1.3+3.1);d=max(6,(n-1)*2.25+3.6);back=d/2;left=-w/2
 floor=mat('01 / mineral floor',(.22,.25,.24) if key in ['garage','workshop'] else (.32,.40,.43),.1,.82)
 walls=mat('02 / painted plaster',(.37,.43,.40) if key=='garage' else (.18,.29,.31) if industrial else (.57,.65,.62))
 graphite=mat('03 / charcoal steel',(.045,.073,.084),.45,.4);edge=mat('04 / brushed alloy',(.34,.43,.45),.65,.3);wood=mat('05 / warm oak',(.40,.22,.10),0,.7);white=mat('06 / ivory',(.77,.79,.67),.1,.55)
 amber=mat('07 / illumination',(.98,.67,.29),0,.35,2);teal=mat('08 / glass',(.08,.30,.34),.5,.2);red=mat('09 / vermilion',(.56,.12,.065));leaf=mat('10 / foliage',(.10,.27,.14));tape=mat('11 / safety paint',(.67,.46,.14));screen=mat('12 / screen',(.10,.46,.49),.2,.25,.6)
 def b(name,x,y,z,sx,sy,sz,m,bev=0):return cube(name,(x,y,z),(sx,sy,sz),m,bev)
 def cable(name,pts,r=.025,m=graphite):return line(name,pts,r,m)
 def plant(x,y,scale=1):
  cylinder('Ceramic planter',(x,y,.23*scale),.25*scale,.46*scale,white)
  for i in range(6):
   a=i*2.4;cable('Stem',[(x,y,.4*scale),(x+math.cos(a)*.2*scale,y+math.sin(a)*.2*scale,1.1*scale)],.013*scale,leaf)
   bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.24*scale,location=(x+math.cos(a)*.20*scale,y+math.sin(a)*.20*scale,(.7+i*.06)*scale));o=bpy.context.object;o.scale=(.6,1,1.8);o.data.materials.append(leaf)
 def desk(x,y,length=1.5):
  b('Timber worktop',x,y,.86,length,.7,.09,wood,.035)
  for dx in [-length/2+.1,length/2-.1]:b('Desk pedestal',x+dx,y,.42,.12,.6,.84,graphite,.01)
  b('Monitor foot',x,y+.12,.95,.35,.22,.05,edge);b('Monitor stand',x,y+.14,1.08,.055,.045,.3,edge);b('Monitor casing',x,y+.17,1.25,.65,.055,.39,graphite,.025);b('Monitor pixels',x,y+.136,1.25,.57,.012,.31,screen)
  for i in range(3):b('Terminal lines',x-.08,y+.125,1.31-i*.06,.29-i*.04,.006,.013,white)
  b('Keyboard',x,y-.17,.93,.47,.17,.035,graphite,.012)
  for i in range(5):b('Key row',x,y-.22+i*.025,.95,.40,.01,.008,edge)
  cylinder('Coffee cup',(x+.47,y-.17,.98),.055,.12,white)
 def chair(x,y):
  cylinder('Chair base',(x,y,.11),.26,.05,graphite,8);cylinder('Chair gas lift',(x,y,.29),.04,.35,edge,8);b('Upholstered seat',x,y,.48,.48,.45,.12,teal,.05);b('Upholstered back',x,y+.2,.75,.48,.12,.48,teal,.05)
 b('Floating foundation',0,0,-.20,w+.12,d+.12,.36,graphite,.08);b('Sealed floor',0,0,-.012,w,d,.06,floor)
 b('Back wall',0,back,1.65,w,.18,3.3,walls,.02)
 b('Left cutaway wall',left,0,.62,.18,d,1.24,walls,.025);b('Right cutaway wall',-left,0,.27,.18,d,.54,walls,.025)
 b('Skirting',0,back-.12,.12,w,.08,.22,graphite);b('Left skirting',left+.12,0,.12,.08,d,.22,graphite)
 for x in [-w/2+.18,w/2-.18]:b('Structural column',x,back-.17,1.65,.2,.25,3.3,graphite,.025)
 # Floor expansion joints and non-emissive brackets replace oversized white pedestals.
 for y in range(-int(d/2),int(d/2)+1):b('Concrete joint',0,y,.022,w-.3,.013,.005,graphite)
 for r in range(n):
  for c in range(n):
   x=(c-(n-1)/2)*1.3;y=-(r-(n-1)/2)*2.25
   for dx in [-.49,.49]:
    for dy in [-.44,.44]:
     b('Painted bay corner',x+dx,y+dy,.029,.12,.025,.004,tape);b('Painted bay corner',x+dx,y+dy,.029,.025,.12,.004,tape)
 # Fixed utility strip is outside every playable tile.
 for x in [left+.6,-left-.6]:
  b('Perimeter cable race',x,0,.055,.10,d-.5,.08,graphite,.015)
  for y in [-d/3,0,d/3]:b('Floor power socket',x,y,.11,.2,.17,.08,edge,.012)
 if key=='garage':
  # A lived-in startup, with an unmistakable workshop silhouette.
  b('Roll-up door frame',1.15,back-.14,1.45,2.7,.12,2.65,graphite,.03)
  for i in range(15):b('Door corrugation',1.15,back-.23,.23+i*.168,2.53,.055,.14,edge,.014)
  b('Door handle',1.15,back-.29,.65,.4,.055,.045,graphite,.015)
  desk(-1.75,back-.65,1.5);chair(-1.75,back-1.32)
  b('Pegboard',-1.75,back-.12,2.02,1.45,.08,.78,wood,.03)
  for i in range(7):
   x=-2.32+i*.19;b('Tool handle',x,back-.2,2,.045,.05,.25,red if i%2 else graphite,.01);b('Tool head',x,back-.2,2.17,.12,.06,.075,edge)
  for i in range(5):
   x=left+.48+(i%2)*.47;y=back-2.2-(i//2)*.48;z=.24+(i%2)*.12
   b('Folded cardboard box',x,y,z,.42,.42,z*2,wood,.025);b('Packing tape',x,y,z*2+.004,.07,.43,.006,tape);b('Shipping label',x,y-.214,z,.15,.006,.10,white)
  for x in [left+.4,left+.8]:cylinder('Spare tyre',(x,-.6,.23),.23,.15,graphite,16,(math.pi/2,0,0))
  b('Metal shelf frame',left+.43,back-3.1,1.15,.08,.08,2.1,graphite)
  cable('Lamp suspension',[(0,back-.8,3.25),(0,back-.8,2.76)],.017,graphite)
  bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.35,radius2=.12,depth=.22,location=(0,back-.8,2.70));bpy.context.object.data.materials.append(graphite)
  cylinder('Single warm bulb',(0,back-.8,2.59),.22,.025,amber,16)
  cable('Loose orange extension',[(left+.7,-1,.1),(left+1,-1.2,.1),(left+.8,-1.55,.1),(left+.4,-1.4,.1),(left+.7,-1,.1)],.023,red)
  text('Garage wall identifier','01 / NEURON LAB',(-1.65,back-.19,2.73),.16,white)
 elif key=='workshop':
  desk(-1.4,back-.65,2.8);chair(-1.1,back-1.3)
  b('Tool cabinet',-left-.65,back-.6,.65,.85,.75,1.3,red,.04)
  for i in range(5):b('Drawer seam',-left-.65,back-.99,.18+i*.22,.74,.02,.018,graphite);b('Drawer pull',-left-.65,back-1.02,.26+i*.22,.28,.04,.03,edge)
  b('Perforated tool board',-1.4,back-.16,1.93,2.8,.08,1.1,graphite,.025)
  for i in range(10):
   x=-2.6+i*.26;b('Spanner',x,back-.23,1.95,.04,.04,.38,edge);cylinder('Spanner head',(x,back-.24,2.15),.065,.04,edge,6,(math.pi/2,0,0))
  for x in [left+.48,-left-.48]:
   for z in [.4,1,1.6]:b('Parts shelving',x,back-2.2,z,.65,1.2,.055,edge)
   for y in [back-2.65,back-2.2]:b('Parts bin',x,y,1.15,.45,.35,.25,teal,.02)
  text('Workshop identifier','02 / HARDWARE WORKSHOP',(0,back-.2,2.77),.19,white)
 elif key=='technopark':
  for x in [-w/3,0,w/3]:
   b('Window frame',x,back-.13,2.15,w/4,.12,1.7,graphite,.02);b('Daylit pane',x,back-.2,2.15,w/4-.13,.035,1.55,teal)
   b('Window mullion',x,back-.24,2.15,.035,.03,1.55,edge);desk(x,back-.8,1.45);chair(x,back-1.5)
  plant(left+.55,-d/3);plant(-left-.55,back-2.4)
 elif industrial:
  for x in [-w/3,w/3]:
   cylinder('Exposed air duct',(x,back-.7,2.8),.24,1.5,edge,12,(math.pi/2,0,0))
   b('Wall ventilation',x,back-.24,1.95,1.5,.26,1,graphite,.05)
   for i in range(8):b('Vent louvre',x,back-.4,1.58+i*.10,1.35,.035,.035,edge)
  for x in [left+.4,-left-.4]:
   b('Cable ladder',x,0,2.55,.18,d-.5,.07,edge)
   for y in range(-int(d/2),int(d/2)):b('Cable tray rung',x,y,2.6,.3,.045,.04,graphite)
   cable('Amber data trunk',[(x-.05,-d/2+.3,2.64),(x-.05,back-.6,2.64)],.032,tape)
  b('Electrical cabinet',0,back-.27,1.4,1.2,.35,1.6,edge,.05)
  b('Switchboard display',0,back-.46,1.72,.65,.025,.33,screen)
  for x in [-.25,0,.25]:cylinder('Status lamp',(x,back-.49,1.3),.035,.02,amber,8,(math.pi/2,0,0))
  text('Industrial identifier',{'server-hall':'04 / COMPUTE HALL','dc-north':'NORTH / DATA CENTER','dc-south':'SOUTH / DATA CENTER'}[key],(0,back-.15,2.94),.20,white)
 elif key=='campus':
  for i in range(8):
   x=-w/2+.6+i*(w-1.2)/7;b('Panoramic glazing',x,back-.14,1.7,(w-1.2)/7-.045,.05,3,teal);b('Bronze mullion',x,back-.20,1.7,.035,.045,3.1,wood)
  for x in [left+.65,-left-.65]:plant(x,back-1.3,1.4)
  b('Lounge bench',0,back-.75,.46,3,.7,.65,white,.09);b('Lounge back',0,back-.46,.95,3,.2,.8,teal,.07)
  text('Campus identifier','NEURON / CAMPUS',(0,back-.24,2.63),.28,white)
 else:
  b('Reception curved counter',-1,0,.61,2.7,.85,1.22,wood,.12);b('Reception stone top',-1,0,1.25,2.85,.95,.1,white,.04)
  for x in [-2.1+i*.16 for i in range(15)]:b('Oak reception fluting',x,-.445,.63,.035,.04,1.1,graphite)
  text('Reception wordmark','NEURON',(-1,-.47,.77),.23,white)
  b('Meeting partition frame',1,back-1.1,1.6,.06,2.1,3.1,edge)
  b('Meeting glazing',1,back-1.1,1.6,.025,2.0,3,teal)
  desk(2.05,back-1.4,1.4);chair(2,back-2);chair(2,back-.65)
  b('Registration frame',-1.3,back-.16,1.8,1.1,.07,.82,wood,.03);b('Registration paper',-1.3,back-.205,1.8,.94,.02,.67,white)
  text('Certificate heading','NEURON',(-1.3,back-.22,1.95),.1,graphite)
  for i in range(4):b('Certificate line',-1.3,back-.22,1.83-i*.07,.6,.005,.012,edge)
  cylinder('Certificate seal',(-1.05,back-.23,1.58),.06,.008,tape,12,(math.pi/2,0,0));plant(left+.65,back-.6,1.4)
 if key!='garage':
  for x in [-w/3,w/3]:b('Recessed luminaire housing',x,back-.35,3.03,1.8,.25,.10,graphite,.02);b('Recessed light strip',x,back-.49,3.02,1.65,.025,.045,amber)
 # Fire protection, conduits, wall fixings are small but consistent scale cues.
 cylinder('Fire extinguisher',(-left-.30,back-.4,.62),.095,.48,red,12);b('Extinguisher bracket',-left-.30,back-.41,.91,.13,.08,.08,graphite)
 cable('Wall electrical conduit',[(left+.25,back-.14,.2),(left+.25,back-.14,2.45),(left+1.1,back-.14,2.45)],.022,edge)
 b('Fuse box',left+.6,back-.2,1.35,.3,.15,.4,graphite,.025)
 batch_materials();count=triangles();assert count<16000,(key,count)
 bpy.ops.export_scene.gltf(filepath=str(WEB/(key+'.glb')),export_format='GLB',export_cameras=False,export_lights=False)
 preview(OUT/(key+'.png'),span=max(w+2.5,(d*.375+4.5)*1.48))
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(key+'.blend')),compress=True)
 manifest['models'].append({'id':key,'file':key+'.glb','source':'artifacts/interiors/'+key+'.blend','rows':n,'cols':n,'triangles':count,'bytes':(WEB/(key+'.glb')).stat().st_size,'width':w,'depth':d})
 (WEB/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
