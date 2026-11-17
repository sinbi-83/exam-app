import type { SVGProps } from 'react'
const paths: Record<string, string> = {
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
  book: 'M12 5v16M12 5C9 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-3-1-7-2-10 1Z',
  exam: 'M9 3H4v18h16V7l-4-4H9Zm7 0v5h4M8 12h8m-8 4h5',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3m1-18a4 4 0 0 1 0 8m3 10v-3a5 5 0 0 0-3-4.6',
  building: 'm2 10 10-7 10 7M5 8v13h14V8M9 21v-7h6v7M9 9h.01M15 9h.01',
  settings: 'm9 3-1 3-3 1-2 4 2 2v3l3 2 1 3h6l1-3 3-2v-3l2-2-2-4-3-1-1-3H9Zm3 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  arrow: 'm9 5 7 7-7 7', plus: 'M12 5v14M5 12h14', check: 'm5 12 4 4L19 6M3 3h18v18H3Z',
  menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M6 18 18 6',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', mail: 'M3 5h18v14H3V5Zm0 0 9 8 9-8',
}
export default function PortalIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: string }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] ?? paths.exam} /></svg>
}
