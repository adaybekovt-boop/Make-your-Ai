import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root=path.resolve(process.argv[2]||'.');
const stage=process.argv[3]||'baseline';
const output=path.resolve(process.env.RENDER_PROFILE_ROOT||root+'/artifacts/render-profile','builds',stage);
const {build}=await import(pathToFileURL(root+'/node_modules/vite/dist/node/index.js'));
const {default:react}=await import(pathToFileURL(root+'/node_modules/@vitejs/plugin-react/dist/index.js'));
const probe=(await readFile(new URL('./probe.js',import.meta.url),'utf8')).replaceAll('__THREE__',root+'/node_modules/three/build/three.module.js');
await mkdir(output,{recursive:true});
await build({root,base:'./',configFile:false,plugins:[
  {name:'measurement-only',enforce:'pre',resolveId(id){if(id==='three')return '\0measurement:three'},load(id){if(id==='\0measurement:three')return probe},transform(s,id){if(id.endsWith('/src/store/gameStore.ts'))return s+'\n;globalThis.__perfStore=useGameStore;\n';}},
  react()
],build:{outDir:output,emptyOutDir:true,sourcemap:true,minify:true}});
await writeFile(output+'/measurement-build.json',JSON.stringify({stage,production:true,measurementShim:true,fixedActualPixelRatio:1,srcModifiedByShim:false,storeAccess:'exposed in measurement bundle only'},null,2));
