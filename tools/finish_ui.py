from pathlib import Path
p=Path('src/render/StreetLife.ts');s=p.read_text(encoding='utf8');s=s.replace('interface ActorBatch { parts: ActorPart[]; route: StreetRoute; indices: number[]; lengths: number[]; total: number }','interface ActorMember { route: StreetRoute; index: number; lengths: number[]; total: number }\ninterface ActorBatch { parts: ActorPart[]; kind: StreetRoute[\'kind\']; members: ActorMember[] }')
a=s.index('    for (const route of routes) {');b=s.index("    for (const kind of ['person', 'car', 'dog'])",a)
s=s[:a]+'''    for (const kind of ['person', 'car', 'dog'] as const) {
      const templates = city.children.filter(o => o.name.startsWith(`actor_${kind}_`))
      if (!templates.length) { const fallback = city.getObjectByName(`actor_${kind}`); if (fallback) templates.push(fallback) }
      const members: ActorMember[] = routes.filter(r => r.kind === kind).flatMap(route => {
        const lengths = routeLengths(route.points), total = lengths.reduce((a, b) => a + b, 0)
        return Array.from({ length: route.count }, (_, index) => ({ route, index, lengths, total }))
      })
      templates.forEach((template, variant) => {
        template.visible = false
        const selected = members.filter((_, index) => index % templates.length === variant)
        if (!selected.length) return
        const batch: ActorBatch = { parts: [], kind, members: selected }
        template.updateWorldMatrix(true, true)
        const inverse = template.matrixWorld.clone().invert()
        template.traverse(source => {
          if (!(source instanceof THREE.Mesh)) return
          const material = Array.isArray(source.material) ? source.material.map(m => m.clone()) : source.material.clone()
          const mesh = new THREE.InstancedMesh(source.geometry, material, selected.length)
          mesh.name = `${kind} ${variant + 1} / ${source.name}`
          mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          let joint = source.name, ancestor: THREE.Object3D | null = source
          while (ancestor && ancestor !== template) { if (ancestor.userData.joint) joint = ancestor.userData.joint; ancestor = ancestor.parent }
          batch.parts.push({ mesh, bind: new THREE.Matrix4().multiplyMatrices(inverse, source.matrixWorld), joint })
          this.group.add(mesh)
        })
        this.batches.push(batch)
      })
    }
''' +s[b:]
s=s.replace('      const { route, lengths, total, indices, parts } = batch\n      indices.forEach((actorIndex, instance) => {\n        const distance = total * actorIndex / route.count + this.time * route.speed','      const { parts } = batch\n      batch.members.forEach(({ route, lengths, total, index }, instance) => {\n        const distance = total * index / route.count + this.time * route.speed')
s=s.replace("batch.route.kind === 'car'", "batch.kind === 'car'")
p.write_text(s,encoding='utf8')
p=Path('src/ui/ProcurementModal.tsx');s=p.read_text(encoding='utf8');s=s.replace('Шасси + чип','Полный комплект сервера').replace('Только шасси','Пустая стойка').replace('Только чип на склад','Вычислительный модуль на склад').replace('<label>Шасси<select','<label>Стойка (корпус сервера)<select').replace('<label>Чип<select','<label>Вычислительный модуль<select').replace('Смонтировать шасси','1. Установить стойку').replace('Смонтировать чип','2. Установить модуль')
s=s.replace('<div className="procurement-flow">','''<div className="procurement-flow">
      <div className="equipment-preview"><img src={`${import.meta.env.BASE_URL}models/racks/${selectedChassis}.png`} alt={CHASSIS[selectedChassis].name} /><div><span className="card-caption">Ваша конфигурация</span><h3>{mode === 'chassis' ? 'Пустая стойка' : selectedChip ? CHIPS[selectedChip].name : 'Выберите модуль'}</h3><p>{CHASSIS[selectedChassis].name}</p><small>Стойка — корпус и охлаждение.<br />Модуль — вычислительная мощность.</small></div></div>
      <ol className="procurement-steps"><li><b>01</b> Закажите</li><li><b>02</b> Дождитесь доставки</li><li><b>03</b> Установите со склада</li></ol>''')
s=s.replace('Заказ → доставка на склад → монтаж','После доставки установите сначала стойку, затем вычислительный модуль')
s=s.replace("<h3>На складе · монтаж в выбранную ячейку</h3>","<h3>Доставленное оборудование</h3><p className=\"card-note\">{existingChassis ? 'Стойка установлена. Выберите совместимый модуль ниже.' : 'Начните с установки стойки; затем станет доступна установка модуля.'}</p>")
p.write_text(s,encoding='utf8')
p=Path('src/ui/InteriorScreen.tsx');s=p.read_text(encoding='utf8').replace('Серверная комната · фиксированный вид 22°','Инфраструктура компании').replace("<span className=\"floor-legend\">", "<span className=\"floor-legend\">")
s=s.replace('<div className="floor-legend">','<div className="interior-guide"><span>ВАША СЕРВЕРНАЯ</span><strong>{location.installedServers.some(item => item.gridPosition) ? \'Нажмите на сервер для управления\' : \'Первый сервер начинается здесь\'}</strong><p>Выберите свободное место на полу. Закажите комплект, дождитесь доставки и установите его со склада.</p></div><div className="floor-legend">')
p.write_text(s,encoding='utf8')
# Requested local review grant. Explicit URL action, preserving everything except cash.
p=Path('src/ui/App.tsx');s=p.read_text(encoding='utf8');needle='  const personality = state.game.model.personality';insert='''  useEffect(() => {
    if (!import.meta.env.DEV || !state.ready) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('reviewFunds') !== '100000000') return
    url.searchParams.delete('reviewFunds')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    const current = useGameStore.getState()
    useGameStore.setState({ game: { ...current.game, cash: Math.max(current.game.cash, 100_000_000) } })
    if (current.storageEnabled) void useGameStore.getState().persist(true)
  }, [state.ready])

''';assert needle in s;s=s.replace(needle,insert+needle);p.write_text(s,encoding='utf8')
