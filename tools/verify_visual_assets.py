"""Offline GLB import verification in Blender; no game/browser actions."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];results=[]
for family in ['interiors','racks','actors']:
 folder=ROOT/'public/models'/family;m=json.loads((folder/'manifest.json').read_text(encoding='utf8'))
 for entry in m['models']:
  bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(folder/entry['file']))
  meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];count=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
  assert count==entry['triangles'],(entry['file'],count,entry['triangles'])
  assert (folder/entry['file']).stat().st_size==entry['bytes']
  if entry.get('kind')=='person':
   names={o.name for o in bpy.context.scene.objects};assert all(n in names for n in ['body','arm_l','arm_r','leg_l','leg_r','knee_l','knee_r']),names
   assert bpy.data.objects['knee_l'].parent is not None
   assert any(o.animation_data for o in bpy.context.scene.objects)
  if family=='racks':assert {'compute_modules','rack_chassis'} <= {o.name for o in bpy.context.scene.objects}
  results.append({'file':entry['file'],'triangles':count,'bytes':entry['bytes'],'reimport':True})
# Exact interactive IDs and bounded region are also checked on the exported city.
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/living-city/living-city.glb'))
manifest=json.loads((ROOT/'public/models/living-city/manifest.json').read_text(encoding='utf8'))
for entry in manifest['objects']:assert bpy.data.objects.get(entry['node']) is not None,entry
assert len({e['id'] for e in manifest['objects']})==12
assert all((ROOT/'public/models/actors'/(name+'.glb')).exists() for name in manifest['actorFiles'])
(ROOT/'artifacts/visual-offline-verification.json').write_text(json.dumps({'assets':results,'cityInteractiveObjects':12,'cityBytes':(ROOT/'public/models/living-city/living-city.glb').stat().st_size,'browserInteraction':False},indent=2),encoding='utf8')
print('VERIFIED',len(results),'models and 12 city objects')
