import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} className="modal" aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === dialog.current) onClose() }}>
    <div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Закрыть окно" onClick={onClose} autoFocus><Icon name="close" /></button></div>
    <div className="modal-body">{children}</div>
  </dialog>
}
