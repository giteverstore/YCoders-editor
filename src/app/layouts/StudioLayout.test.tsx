import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { StudioLayout, STUDIO_SIDEBAR_PREFERENCE } from './StudioLayout'

vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { displayName: 'Author' }, role: 'SUPER_ADMIN', signOutUser: vi.fn() }) }))
afterEach(() => vi.unstubAllGlobals())

function render(collapsed: boolean) {
  const values = new Map([[STUDIO_SIDEBAR_PREFERENCE, String(collapsed)]])
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  return renderToStaticMarkup(<MemoryRouter initialEntries={['/courses']}><StudioLayout /></MemoryRouter>)
}

describe('Studio sidebar collapse contract', () => {
  it('shows the explicit Workspace collapse control while expanded', () => { const html = render(false); expect(html).toContain('Workspace'); expect(html).toContain('aria-label="Collapse Studio sidebar"'); expect(html).toContain('title="Collapse sidebar"'); expect(html).toContain('aria-expanded="true"') })
  it('restores the narrow icon rail preference with an obvious expand control', () => { const html = render(true); expect(html).toContain('studio-shell--sidebar-collapsed'); expect(html).toContain('sidebar--collapsed'); expect(html).toContain('aria-label="Expand Studio sidebar"'); expect(html).toContain('title="Expand sidebar"'); for (const label of ['Courses', 'Practice', 'Challenges', 'Projects']) expect(html).toContain(label) })
})
