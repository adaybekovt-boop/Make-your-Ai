from pathlib import Path
p=Path('src/render/InteriorScene.ts');s=p.read_text(encoding='utf8').replace("import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'", "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'\nimport { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'").replace('    const loader = new GLTFLoader()',"    const decoder = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}models/metropolis/draco/`).setWorkerLimit(1)\n    const loader = new GLTFLoader().setDRACOLoader(decoder)")
s=s.replace("this.onError(error instanceof Error ? error.message : 'Ошибка загрузки интерьера') }", "this.onError(error instanceof Error ? error.message : 'Ошибка загрузки интерьера') } finally { decoder.dispose() }")
p.write_text(s,encoding='utf8')
