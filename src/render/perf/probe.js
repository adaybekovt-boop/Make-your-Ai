// Measurement-only module: substituted by perf/build.mjs, never imported by the game.
import { WebGLRenderer as BaseRenderer } from '__THREE__';
export * from '__THREE__';
const p = globalThis.__renderProbe = {
  renderers: [], frames: [], raf: [], events: [], recording: false, start: 0,
  reset() { this.frames = []; this.raf = []; this.events = []; this.start = performance.now(); },
  snapshot() { return { frames: this.frames, raf: this.raf, events: this.events,
    renderers: this.renderers.map(x => ({ id:x.id, disposed:x.disposed, contextLost:x.contextLost, renders:x.renders, width:x.width, height:x.height, pixelRatio:x.pixelRatio, geometries:x.geometries, textures:x.textures, programs:x.programs, lastCalls:x.lastCalls, lastTriangles:x.lastTriangles, lastMeshes:x.lastMeshes, instances:x.instances, equipment:x.equipment })), elapsed:performance.now()-this.start }; }
};
let lastRaf=0;
function sample(t) { if(p.recording && lastRaf) p.raf.push(t-lastRaf); lastRaf=t; requestAnimationFrame(sample); }
requestAnimationFrame(sample);
export class WebGLRenderer extends BaseRenderer {
  constructor(...args) {
    super(...args);
    const item={id:p.renderers.length+1,disposed:false,contextLost:false,renders:0};p.renderers.push(item);
    const ratio=this.setPixelRatio.bind(this);
    this.setPixelRatio=requested=>{item.requestedPixelRatio=requested;ratio(1);item.pixelRatio=this.getPixelRatio()};
    this.setPixelRatio(1);
    const render=this.render.bind(this);
    this.render=(scene,camera)=>{
      const t=performance.now();render(scene,camera);const end=performance.now();item.renders++;
      if(item.renders<6 || p.wantInspect){let meshes=0,instances=0;scene.traverse(o=>{if(o.isMesh)meshes++;if(o.isInstancedMesh)instances+=o.count});item.lastMeshes=meshes;item.instances=instances;item.equipment=scene.children.filter(o=>o.isGroup).map(o=>({name:o.name,children:o.children.length}));p.wantInspect=false;}
      item.width=this.domElement.width;item.height=this.domElement.height;
      item.geometries=this.info.memory.geometries;item.textures=this.info.memory.textures;item.programs=this.info.programs?.length??0;
      item.lastCalls=this.info.render.calls;item.lastTriangles=this.info.render.triangles;
      if(p.recording)p.frames.push({renderer:item.id,t,ms:end-t,calls:item.lastCalls,triangles:item.lastTriangles,geometries:item.geometries,width:item.width,height:item.height,pixelRatio:item.pixelRatio});
    };
    const dispose=this.dispose.bind(this);this.dispose=()=>{item.disposed=true;p.events.push({kind:'dispose',id:item.id,t:performance.now()});dispose()};
    const loss=this.forceContextLoss.bind(this);this.forceContextLoss=()=>{item.contextLost=true;p.events.push({kind:'forceContextLoss',id:item.id,t:performance.now()});loss()};
  }
}
