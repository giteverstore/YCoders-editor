import { Construction, Hash } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { ButtonLink } from '../../components/ui/ButtonLink'
import type { DomainDefinition } from '../../lib/domains'

type DomainEditorPageProps = { domain: DomainDefinition; mode: 'create' | 'edit' }

export function DomainEditorPage({ domain, mode }: DomainEditorPageProps) {
  const { id } = useParams<{ id: string }>()
  const isCreating = mode === 'create'
  return (
    <section className="page-stack" aria-labelledby="editor-title">
      <div className="breadcrumbs"><span>{domain.plural}</span><span aria-hidden="true">/</span><strong>{isCreating ? 'New' : 'Edit'}</strong></div>
      <div className="editor-placeholder">
        <span className="editor-placeholder__icon"><Construction size={30} /></span>
        <p className="eyebrow">Editor placeholder</p>
        <h2 id="editor-title">{isCreating ? `Create a new ${domain.singular.toLowerCase()}` : `Edit ${domain.singular.toLowerCase()}`}</h2>
        <p>The {domain.singular.toLowerCase()} editor will be introduced in a future milestone. No content is being stored or published from this page.</p>
        {!isCreating && <div className="content-id"><Hash size={16} aria-hidden="true" /><span>Content ID</span><code>{id}</code></div>}
        <ButtonLink to={`/${domain.slug}`} variant="secondary">Back to {domain.plural.toLowerCase()}</ButtonLink>
      </div>
    </section>
  )
}
