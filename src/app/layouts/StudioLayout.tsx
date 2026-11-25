import { Menu, PanelLeftClose, PanelLeftOpen, Sparkles, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { domains, getDomainFromPath } from '../../lib/domains'
import { getReleaseDomainStatus } from '../../lib/releaseDomains'
import { useAuth } from '../../auth/authContext'

export const STUDIO_SIDEBAR_PREFERENCE = 'ycoders-editor:sidebar-collapsed'
export function readStudioSidebarPreference(storage?: Pick<Storage, 'getItem'>) { return storage?.getItem(STUDIO_SIDEBAR_PREFERENCE) === 'true' }
export function writeStudioSidebarPreference(storage: Pick<Storage, 'setItem'>, collapsed: boolean) { storage.setItem(STUDIO_SIDEBAR_PREFERENCE, String(collapsed)) }

export function StudioLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => readStudioSidebarPreference(typeof window === 'undefined' ? undefined : window.localStorage))
  const location = useLocation()
  const auth = useAuth()
  const currentDomain = getDomainFromPath(location.pathname)
  const isEditorRoute = location.pathname.endsWith('/new') || location.pathname.endsWith('/edit')
  const pageTitle = currentDomain
    ? `${isEditorRoute ? (location.pathname.endsWith('/new') ? 'New ' : 'Edit ') : ''}${currentDomain.singular}${isEditorRoute ? '' : currentDomain.plural === currentDomain.singular ? '' : 's'}`
    : 'Page not found'

  const closeSidebar = () => setIsSidebarOpen(false)
  const toggleSidebar = () => setIsSidebarCollapsed((current) => { const next = !current; writeStudioSidebarPreference(window.localStorage, next); return next })

  return (
    <div className={`studio-shell ${isSidebarCollapsed ? 'studio-shell--sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {isSidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={closeSidebar} />}
      <aside className={`sidebar ${isSidebarOpen ? 'sidebar--open' : ''} ${isSidebarCollapsed ? 'sidebar--collapsed' : ''}`} aria-label="Studio navigation">
        <div className="brand">
          <span className="brand__mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span className="brand__copy"><strong>Ycoders</strong><small>Editor Studio</small></span>
          <button className="icon-button sidebar__close" onClick={closeSidebar} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <nav className="sidebar__nav">
          <div className="sidebar__workspace-heading"><p className="eyebrow">Workspace</p><button type="button" className="icon-button" title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={isSidebarCollapsed ? 'Expand Studio sidebar' : 'Collapse Studio sidebar'} aria-expanded={!isSidebarCollapsed} onClick={toggleSidebar}>{isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
          {domains.map(({ icon: Icon, plural, slug }) => getReleaseDomainStatus(slug) === 'enabled' ? (
            <NavLink key={slug} to={`/${slug}`} title={isSidebarCollapsed ? plural : undefined} onClick={closeSidebar} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}>
              <Icon size={19} aria-hidden="true" />
              <span>{plural}</span>
            </NavLink>
          ) : (
            <div key={slug} className="nav-link nav-link--disabled" aria-disabled="true" title={`${plural} are Work in Progress`}>
              <Icon size={19} aria-hidden="true" />
              <span>{plural}<small>Work in Progress</small></span>
            </div>
          ))}
        </nav>
        <div className="sidebar__footer"><PanelLeftClose size={17} aria-hidden="true" /><span>Studio foundation · E1</span></div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar__title">
            <button className="icon-button menu-button" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
            <div><span className="eyebrow">Content workspace</span><h1>{pageTitle}</h1></div>
          </div>
          <button className="account" type="button" aria-label="Sign out" title="Sign out" onClick={() => void auth.signOutUser()}>
            <span className="account__avatar"><UserRound size={17} /></span>
            <span className="account__copy"><strong>{auth.user?.displayName ?? auth.user?.email ?? 'Studio user'}</strong><small>{auth.role} · Sign out</small></span>
          </button>
        </header>
        <main id="main-content" className="content"><Outlet /></main>
      </div>
    </div>
  )
}
