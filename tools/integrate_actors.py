from pathlib import Path
p=Path('src/render/CityBackdrop.ts');s=p.read_text(encoding='utf8').replace('  scale: number','  actorFiles?: string[]\n  bounds?: [number, number, number, number]\n  scale: number')
s=s.replace("    const city = gltf.scene",'''    const city = gltf.scene
    try {
      const actorResults = await Promise.allSettled((manifest.actorFiles ?? []).map(async name => {
        const response = await fetch(`${import.meta.env.BASE_URL}models/actors/${name}.glb`, { signal: controller.signal })
        if (!response.ok) throw new Error('Не удалось загрузить жителей города.')
        const actor = (await loader.parseAsync(await response.arrayBuffer(), '')).scene
        const [kind, index] = name.split('-')
        actor.name = `actor_${kind}_${Number(index) - 1}`
        actor.visible = false
        city.add(actor)
      }))
      if (actorResults.some(result => result.status === 'rejected')) throw new Error('Не удалось загрузить транспорт или жителей города.')
    } catch (error) {
      city.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose() } })
      throw error
    }''');p.write_text(s,encoding='utf8')
p=Path('src/render/RegionMap.ts');s=p.read_text(encoding='utf8');s=s.replace("['Мой технопарк', () => this.focusLocations()],", "['Мой технопарк', () => this.focusLocations()],\n      ['Дата-центры', () => this.focusArea(new THREE.Vector3(3500, 0, 0), 2.7)],")
s=s.replace('instance.resize()\n      // Render', 'instance.resize()\n      instance.focusLocations()\n      // Render')
s=s.replace("resetView() { this.focusArea(new THREE.Vector3(500, 0, 0), 1) }", "resetView() { this.focusArea(new THREE.Vector3(500, 0, 0), 1.22) }")
s=s.replace('|| this.camera.zoom >= 3.5','|| this.camera.zoom >= 1.8')
s=s.replace('    this.dirty = true\n    this.projectDirty = true\n    this.schedule()\n  }\n\n  private resize()', '    this.schedule()\n  }\n\n  private resize()')
s=s.replace('      const clamped = this.controls.target.clone().clamp(new THREE.Vector3(-4800, -2000, -4000), new THREE.Vector3(6000, 2000, 4000))', '      const bounds = this.manifest?.bounds ?? [-3900, -3700, 4900, 3300]\n      const clamped = this.controls.target.clone().clamp(new THREE.Vector3(bounds[0], 0, bounds[1]), new THREE.Vector3(bounds[2], 0, bounds[3]))')
p.write_text(s,encoding='utf8')
