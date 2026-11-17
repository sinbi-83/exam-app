import type { Metadata } from 'next'
import { BRAND } from '@/config/brand'
import PortalShell from './components/PortalShell'
import './globals.css'
export const metadata: Metadata = {
  title: BRAND.name, description: `${BRAND.name} ${BRAND.subtitle}`, manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: BRAND.name },
  other: { 'mobile-web-app-capable': 'yes' },
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><head><meta name="theme-color" content="#1c334d" /><link rel="apple-touch-icon" href="/icon.svg" /></head><body><PortalShell>{children}</PortalShell></body></html>
}