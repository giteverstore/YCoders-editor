import { Menu, PanelLeftClose, Sparkles, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { domains, getDomainFromPath } from '../../lib/domains'
import { useAuth } from '../../auth/authContext'

export function StudioLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()
  const auth = useAuth()
  const currentDomain = getDomainFromPath(location.pathname)
  const isEditorRoute = location.pathname.endsWith('/new') || location.pathname.endsWith('/edit')
  const pageTitle = currentDomain
    ? `${isEditorRoute ? (location.pathname.endsWith('/new') ? 'New ' : 'Edit ') : ''}${currentDomain.singular}${isEditorRoute ? '' : currentDomain.plural === currentDomain.singular ? '' : 's'}`
    : 'Page not found'

  const closeSidebar = () => setIsSidebarOpen(false)

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {isSidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={closeSidebar} />}
      <aside className={`sidebar ${isSidebarOpen ? 'sidebar--open' : ''}`} aria-label="Studio navigation">
        <div className="brand">
          <span className="brand__mark"><Sparkles size={19} aria-hidden="true" /></span>
          <span><strong>Ycoders</strong><small>Editor Studio</small></span>
          <button className="icon-button sidebar__close" onClick={closeSidebar} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <nav className="sidebar__nav">
          <p className="eyebrow">Workspace</p>
          {domains.map(({ icon: Icon, plural, slug }) => (
            <NavLink key={slug} to={`/${slug}`} onClick={closeSidebar} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}>
              <Icon size={19} aria-hidden="true" />
              <span>{plural}</span>
            </NavLink>
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
