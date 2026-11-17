'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BRAND } from '@/config/brand'
import { PORTAL_SECTIONS, isStandalonePage, portalSectionFor } from '@/config/portalNavigation'
import { isNavItemActive } from '@/config/navigation'
import ScheduleAlertBell from './ScheduleAlertBell'
import AppFooter from './AppFooter'
import PortalIcon from './PortalIcon'

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  const standalone = isStandalonePage(path)
  const active = portalSectionFor(path)
  const [logo, setLogo] = useState<string>(BRAND.logo)
  const [dateLabel, setDateLabel] = useState('')
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const mobileMenuButton = useRef<HTMLButtonElement>(null)
  const mobileMenu = useRef<HTMLElement>(null)
  const menuOpen = menuPath === path
  useEffect(() => {
    if (standalone) return
    const controller = new AbortController()
    fetch('/api/settings/academy', { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => { if (json?.data?.logo_url) setLogo(json.data.logo_url) })
      .catch(() => { /* 실제 원본 로고 기본값을 유지한다. */ })
    return () => controller.abort()
  }, [standalone])
  useEffect(() => {
    if (standalone) return
    const updateDate = () => setDateLabel(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()))
    updateDate()
    const id = window.setInterval(updateDate, 60_000)
    return () => window.clearInterval(id)
  }, [standalone])
  useEffect(() => {
    if (!menuOpen) return
    mobileMenu.current?.querySelector<HTMLAnchorElement>('a')?.focus()
    function keydown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMenuPath(null); mobileMenuButton.current?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [menuOpen])
  if (standalone) return <>{children}</>
  return (
    <div className="portal-shell">
      <a href="#portal-content" className="portal-skip">본문으로 바로가기</a>
      <header className="portal-masthead no-print">
        <div className="portal-container portal-brand-row">
          <Link href="/dashboard" className="portal-brand" aria-label={`${BRAND.name} 오늘 화면`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={`${BRAND.name} 로고`} width="112" height="90" onError={() => setLogo(BRAND.logo)} />
            <span className="portal-brand-copy"><strong>{BRAND.name}</strong><span>{BRAND.subtitle}</span></span>
          </Link>
          <div className="portal-header-actions">
            <span className="portal-date">{dateLabel}</span>
            <ScheduleAlertBell />
            <form action="/logout" method="POST" className="portal-logout"><button type="submit">로그아웃</button></form>
            <button ref={mobileMenuButton} type="button" className="portal-mobile-toggle" aria-label={menuOpen ? '전체 메뉴 닫기' : '전체 메뉴 열기'} aria-expanded={menuOpen} aria-controls="portal-mobile-menu" onClick={() => setMenuPath(menuOpen ? null : path)}><PortalIcon name={menuOpen ? 'close' : 'menu'} /></button>
          </div>
        </div>
      </header>
      <div className="portal-navigation no-print">
        <nav className="portal-container portal-top-nav" aria-label="주 메뉴">
          {PORTAL_SECTIONS.map((section) => <Link href={section.href} key={section.key} className={active?.key === section.key ? 'is-active' : ''} aria-current={path === section.href ? 'page' : undefined}><PortalIcon name={section.icon} /><span>{section.label}</span></Link>)}
        </nav>
      </div>
      {active && active.items.length > 1 && <nav className="portal-subnav no-print" aria-label={`${active.label} 세부 메뉴`}><div className="portal-container portal-subnav-inner">{active.items.map((item) => <Link key={item.href} href={item.href} className={isNavItemActive(item, path) ? 'is-active' : ''} aria-current={isNavItemActive(item, path) ? 'page' : undefined}>{item.label}</Link>)}</div></nav>}
      {menuOpen && (
        <nav id="portal-mobile-menu" ref={mobileMenu} className="portal-mobile-menu no-print" aria-label="전체 메뉴">
          {PORTAL_SECTIONS.map((section) => <section key={section.key}>
            <Link href={section.href} className="portal-mobile-section" onClick={() => setMenuPath(null)}><PortalIcon name={section.icon} />{section.label}</Link>
            {section.items.length > 1 && <div className="portal-mobile-links">{section.items.map((item) => <Link href={item.href} key={item.href} onClick={() => setMenuPath(null)} aria-current={isNavItemActive(item, path) ? 'page' : undefined}>{item.label}</Link>)}</div>}
          </section>)}
          <form action="/logout" method="POST"><button type="submit" className="portal-mobile-signout">로그아웃</button></form>
        </nav>
      )}
      <main id="portal-content" tabIndex={-1} className="portal-container portal-content">{children}</main>
      <AppFooter />
    </div>
  )
}
