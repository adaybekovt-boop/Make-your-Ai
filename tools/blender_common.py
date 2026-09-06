"""Shared local Blender modelling helpers. No external textures."""
import bpy, math
from mathutils import Vector

def mat(name,c,metal=0,rough=.65,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emit;return m

def cube(name,pos,size,m,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:
  mod=o.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def cylinder(name,pos,r,depth,m,vertices=12,rotation=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=pos);o=bpy.context.object;o.name=name;o.data.materials.append(m)
 if rotation:o.rotation_euler=rotation
 return o

def line(name,points,r,m):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=1;curve.bevel_depth=r;curve.bevel_resolution=0
 sp=curve.splines.new('POLY');sp.points.add(len(points)-1)
 for p,v in zip(sp.points,points):p.co=(*v,1)
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(m);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def text(name,body,pos,size,m,rotation=(math.pi/2,0,0)):
 cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.size=size;cu.align_x='CENTER';cu.extrude=0;cu.resolution_u=2;o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=rotation;cu.materials.append(m);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def join(obs,name):
 obs=list(obs)
 if not obs:return
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=obs[0];o.name=name;bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o

def batch_materials():
 for m in list(bpy.data.materials):
  join([o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==m],m.name)

def triangles():return sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
def preview(path,target=(0,0,1),span=12):
 s=bpy.context.scene;s.world=bpy.data.worlds.new('Studio atmosphere');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.19,.24,.30,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.65
 for name,pos,power,size,color in [('Warm key',(-4,-6,9),1700,7,(1,.80,.57)),('Cool fill',(5,2,7),1100,6,(.60,.80,1))]:
  ld=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,ld);s.collection.objects.link(o);o.location=pos;ld.energy=power;ld.shape='DISK';ld.size=size;ld.color=color;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
 cd=bpy.data.cameras.new('Art direction');o=bpy.data.objects.new('Art direction',cd);s.collection.objects.link(o);t=Vector(target);o.location=t+Vector((6,-29.4,12.12));o.rotation_euler=(t-o.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=span;s.camera=o
 s.render.engine='CYCLES';s.cycles.samples=20;s.cycles.use_denoising=True;s.render.resolution_x=1400;s.render.resolution_y=950;s.render.resolution_percentage=100;s.render.filepath=str(path)
 bpy.ops.render.render(write_still=True)
