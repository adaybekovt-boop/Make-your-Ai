from pathlib import Path
p=Path('tools/build_equipment.py');s=p.read_text(encoding='utf8').replace('metal,.006)','metal,0)').replace("range(7):cube('Vent slot'","range(5):cube('Vent slot'");p.write_text(s,encoding='utf8')
p=Path('src/render/InteriorScene.ts');s=p.read_text(encoding='utf8');a=s.index('    for (const item of [...rigs, ...servers]) {');b=s.index('    this.resize()',a)
s=s[:a]+'''    const batches = new Map<string, (InstalledServer | ChassisRig)[]>()
    for (const item of [...rigs, ...servers]) {
      if (!item.gridPosition) continue
      const key = `${item.chassis ?? 'rack-basic'}:${'chip' in item ? item.chip : 'empty'}`
      batches.set(key, [...(batches.get(key) ?? []), item])
    }
    const matrix = new THREE.Matrix4(), translation = new THREE.Matrix4()
    for (const items of batches.values()) {
      const first = items[0], template = this.templates.get(first.chassis ?? 'rack-basic')
      if (!template) continue
      template.updateMatrixWorld(true)
      template.traverse(source => {
        if (!(source instanceof THREE.Mesh)) return
        let ancestor: THREE.Object3D | null = source
        while (ancestor) {
          if (ancestor.name === 'compute_modules' && !('chip' in first)) return
          ancestor = ancestor.parent
        }
        const tint = (original: THREE.Material) => {
          const material = original.clone(); this.materials.add(material)
          if (material instanceof THREE.MeshStandardMaterial && material.name === 'chip_indicator') {
            const color = efficiency < 1 ? '#e39c5e' : 'chip' in first && first.chip === 'flagship' ? '#c498ed' : 'chip' in first && first.chip === 'accelerator' ? '#67c6ef' : '#75d6b9'
            material.color.set(color); material.emissive.set(color); material.emissiveIntensity = .8
          }
          return material
        }
        const mesh = new THREE.InstancedMesh(source.geometry, Array.isArray(source.material) ? source.material.map(tint) : tint(source.material), items.length)
        mesh.castShadow = true; mesh.receiveShadow = true
        mesh.userData.cells = items.map(item => item.gridPosition)
        items.forEach((item, index) => {
          const p = cellWorld(this.grid, item.gridPosition!, .04)
          translation.makeTranslation(p.x, p.y, p.z); matrix.multiplyMatrices(translation, source.matrixWorld)
          mesh.setMatrixAt(index, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); this.equipment.add(mesh)
      })
    }
''' +s[b:]
s=s.replace('    this.equipment.clear();',"    this.equipment.children.forEach(o => { if (o instanceof THREE.InstancedMesh) o.dispose() })\n    this.equipment.clear();")
s=s.replace("    if (hit?.object.userData.cell) { this.onSelect(hit.object.userData.cell as GridPosition); return }", "    if (hit?.instanceId !== undefined) { this.onSelect(hit.object.userData.cells[hit.instanceId] as GridPosition); return }")
s=s.replace('    this.assets.forEach(a => this.disposeAsset(a));',"    this.equipment.children.forEach(o => { if (o instanceof THREE.InstancedMesh) o.dispose() })\n    this.scene.traverse(o => { if (o instanceof THREE.DirectionalLight) o.shadow.dispose() })\n    this.assets.forEach(a => this.disposeAsset(a));")
s=s.replace('private render() { if (!this.disposed) this.renderer.render(this.scene, this.camera) }',"private render() { if (!this.disposed) { this.renderer.render(this.scene, this.camera); this.host.dataset.drawCalls = String(this.renderer.info.render.calls); this.host.dataset.triangles = String(this.renderer.info.render.triangles) } }")
p.write_text(s,encoding='utf8')
