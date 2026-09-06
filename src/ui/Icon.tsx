import type { CSSProperties } from 'react'

export type IconName = 'logo' | 'map' | 'server' | 'bolt' | 'wallet' | 'trend' | 'arrow' | 'lock' | 'check' | 'plus' | 'minus' | 'pause' | 'play' | 'save' | 'load' | 'help' | 'close' | 'reset' | 'target' | 'clock' | 'alert' | 'settings' | 'model' | 'flask' | 'users'

const paths: Record<IconName, React.ReactNode> = {
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none" /></>,
  logo: <><path d="M5 19V5h4l6 14h4V5" /><circle cx="19" cy="5" r="1.5" fill="currentColor" /></>,
  map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" /><path d="M9 3v16M15 5v16" /></>,
  server: <><rect x="4" y="3" width="16" height="7" rx="2" /><rect x="4" y="14" width="16" height="7" rx="2" /><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5" /></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />,
  wallet: <><path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6" /><path d="M20 12h-6v5h6M17 14.5h.01" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-10M15 5h6v6" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  pause: <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>,
  play: <path d="m7 4 13 8-13 8V4Z" />,
  save: <><path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-7h10v7" /></>,
  load: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 3M12 17h.01" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 1v3M23 12h-3M12 23v-3M1 12h3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  alert: <><path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01" /></>,
  model: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /></>,
  flask: <><path d="M10 3h4M11 3v6l-6 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-6-9V3" /><path d="M8.5 14h7" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M17 14c2.4.8 4 3 4 6" /></>,
}

export function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style}>{paths[name]}</svg>
}
