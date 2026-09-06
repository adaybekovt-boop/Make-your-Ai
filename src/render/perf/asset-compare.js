// Diagnostic only: reuse the original scene, then preview existing GLB assets.
import { InteriorScene } from '../InteriorScene.ts';
import { Group, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const classes=['rack-basic','rack-cooled','rack-enterprise'];
const servers=Array.from({length:64},(_,i)=>({id:'server-'+(i+1),chip:'consumer-gpu',chassis:classes[i%3],overclock:1,gridPosition:{row:Math.floor(i/8),col:i%8}}));
const original=new InteriorScene(document.querySelector('#scene'),{rows:8,cols:8},()=>{},()=>{});
original.update(servers,null,90/128);
globalThis.__assetScene=original;
globalThis.__previewGLB=async()=>{
  const loader=new GLTFLoader();
  const assets=await Promise.all(classes.map(async name=>({name,scene:(await loader.loadAsync(new URL('../../../models/racks/'+name+'.glb',location.href).href)).scene})));
  const group=new Group();group.name='Existing GLB preview — NOT applied to the game';
  for(const server of servers){const object=assets.find(a=>a.name===server.chassis).scene.clone(true);object.position.set(server.gridPosition.col-3.5,0,server.gridPosition.row-3.5);group.add(object)}
  original.equipment.visible=false;original.scene.add(group);original.renderer.render(original.scene,original.camera);
  document.querySelector('#label').textContent='Предпросмотр: существующие GLB без правки формы, материалов и камеры';
  return {diagnosticOnly:true,gameImplementationChanged:false,newModelsCreated:false,pixelRatio:original.renderer.getPixelRatio(),cameraPosition:original.camera.position.toArray(),assets:assets.map(a=>({name:a.name,size:new Box3().setFromObject(a.scene).getSize(new Vector3()).toArray()})),drawCalls:original.renderer.info.render.calls,triangles:original.renderer.info.render.triangles};
};
