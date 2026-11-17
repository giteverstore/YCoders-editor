import { FilePlus2 } from 'lucide-react'

import { ButtonLink } from '../../components/ui/ButtonLink'
import type { DomainDefinition } from '../../lib/domains'

type DomainListPageProps = { domain: DomainDefinition }

export function DomainListPage({ domain }: DomainListPageProps) {
  const Icon = domain.icon
  return (
    <section className="page-stack" aria-labelledby="domain-title">
      <div className="page-heading">
        <div><p className="eyebrow">Content library</p><h2 id="domain-title">{domain.plural}</h2><p>{domain.description}</p></div>
        <ButtonLink to={`/${domain.slug}/new`} icon="plus">Create {domain.singular.toLowerCase()}</ButtonLink>
      </div>
      <div className="summary-card">
        <span className="summary-card__icon"><Icon size={20} /></span>
        <div><strong>0 {domain.plural.toLowerCase()}</strong><span>Content will appear here after persistence is introduced.</span></div>
      </div>
      <div className="empty-state">
        <span className="empty-state__icon"><FilePlus2 size={27} /></span>
        <h3>No {domain.plural.toLowerCase()} yet</h3>
        <p>Start with a new {domain.singular.toLowerCase()}. This foundation does not save content yet.</p>
        <ButtonLink to={`/${domain.slug}/new`} icon="plus" variant="secondary">Create your first {domain.singular.toLowerCase()}</ButtonLink>
      </div>
    </section>
  )
}
