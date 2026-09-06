import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icon'

export function NoticeToast() {
  const notice = useGameStore((state) => state.notice)
  const dismiss = useGameStore((state) => state.dismissNotice)
  useEffect(() => {
    if (!notice || notice.kind === 'error') return
    const timer = window.setTimeout(dismiss, 4500)
    return () => window.clearTimeout(timer)
  }, [notice, dismiss])
  if (!notice) return null
  return (
    <div className={`toast ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <Icon name={notice.kind === 'error' ? 'help' : 'check'} size={17} />
      <span>{notice.message.replaceAll('GPU', 'Gpu')}</span>
      <button className="icon-button" aria-label="Скрыть уведомление" onClick={dismiss}><Icon name="close" size={15} /></button>
    </div>
  )
}
