from pathlib import Path
p=Path('tools/build_reference_people.py');s=p.read_text(encoding='utf8').replace('(1.07,.16,.10,0,0)','(1.01,waist,.095,0,0)')
s=s.replace("  loft('Leg',[(.10,.045,.043,x,0),(.43,.047,.047,x,0),(.55,.05,.052,x,.012),(.83,.076,.079,x,0),(.88,.073,.08,x,0)],m)","  loft('Upper leg',[(.43,.048,.048,x,0),(.55,.05,.052,x,.012),(.83,.076,.079,x,0),(.88,.073,.08,x,0)],m)\n  upper=batch([o for o in bpy.context.scene.objects if o not in before],'leg_'+side,(x,0,.84))\n  before=set(bpy.context.scene.objects)\n  loft('Shin',[(.10,.045,.043,x,0),(.29,.043,.043,x,0),(.43,.048,.048,x,0)],m)")
s=s.replace("  batch([o for o in bpy.context.scene.objects if o not in before],'leg_'+side,(x,0,.84))", "  lower=batch([o for o in bpy.context.scene.objects if o not in before],'knee_'+side,(x,0,.43))\n  bpy.context.view_layer.update();world=lower.matrix_world.copy();lower.parent=upper;lower.matrix_world=world")
s=s.replace("if o.name.startswith(('arm_','leg_')):","if o.name.startswith(('arm_','leg_','knee_')):")
s=s.replace("for f,a in [(1,0),(7,.33),(13,0),(19,-.33),(25,0)]:o.rotation_euler.x=a*phase;o.keyframe_insert(data_path='rotation_euler',frame=f)","for f,a in [(1,0),(7,.33),(13,0),(19,-.33),(25,0)]:\n    o.rotation_euler.x=max(0,-a*phase)*1.4 if o.name.startswith('knee_') else a*phase;o.keyframe_insert(data_path='rotation_euler',frame=f)")
p.write_text(s,encoding='utf8')
p=Path('src/render/StreetLife.ts');s=p.read_text(encoding='utf8');s=s.replace("  if (!name.startsWith('arm_')", "  if (name.startsWith('knee_')) return Math.max(0, -Math.sin(phase) * (name.endsWith('_l') ? -1 : 1)) * .5\n  if (!name.startsWith('arm_')")
s=s.replace('interface ActorPart { mesh: THREE.InstancedMesh; bind: THREE.Matrix4; joint: string }','interface ActorPart { mesh: THREE.InstancedMesh; chain: { bind: THREE.Matrix4; joint: string }[] }')
s=s.replace('        const inverse = template.matrixWorld.clone().invert()','')
a=s.index('          let joint = source.name, ancestor:');b=s.index('          this.group.add(mesh)',a)
s=s[:a]+'''          const chain: ActorPart['chain'] = []
          let ancestor: THREE.Object3D | null = source
          while (ancestor && ancestor !== template) {
            chain.unshift({ bind: ancestor.matrix.clone(), joint: ancestor.userData.joint ?? ancestor.name })
            ancestor = ancestor.parent
          }
          batch.parts.push({ mesh, chain })
'''+s[b:]
a=s.index("          const angle = route.kind === 'person'");b=s.index('          part.mesh.setMatrixAt',a)
s=s[:a]+'''          this.matrix.copy(this.actor.matrix)
          for (const segment of part.chain) {
            this.matrix.multiply(segment.bind)
            const angle = route.kind === 'person' ? gaitAngle(segment.joint, phase) : 0
            if (angle) this.matrix.multiply(this.rotation.makeRotationX(angle))
          }
'''+s[b:];p.write_text(s,encoding='utf8')
