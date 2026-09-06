"""Blender Draco export of authored sources, with manifest accounting; no browser interaction."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];report=[]
for family in ['interiors','racks','actors']:
 folder=ROOT/'public/models'/family;manifest=json.loads((folder/'manifest.json').read_text(encoding='utf8'))
 for entry in manifest['models']:
  path=folder/entry['file'];before=path.stat().st_size
  bpy.ops.wm.open_mainfile(filepath=str(ROOT/entry['source']));bpy.context.scene.frame_set(1)
  bpy.ops.object.select_all(action='DESELECT')
  for o in bpy.context.scene.objects:
   if o.type=='MESH':o.select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=family=='actors',export_cameras=False,export_lights=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,export_draco_position_quantization=16,export_draco_color_quantization=8)
  entry['bytes']=path.stat().st_size;report.append({'file':str(path.relative_to(ROOT)),'rawBytes':before,'bytes':entry['bytes'],'triangles':entry['triangles']})
 manifest['compression']='Draco, authored in Blender; tools/compress_visual_assets.py'
 (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(ROOT/'artifacts/visual-assets-budget.json').write_text(json.dumps(report,indent=2),encoding='utf8')
