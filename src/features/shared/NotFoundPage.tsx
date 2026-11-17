import { SearchX } from 'lucide-react'

import { ButtonLink } from '../../components/ui/ButtonLink'

export function NotFoundPage() {
  return (
    <section className="editor-placeholder not-found" aria-labelledby="not-found-title">
      <span className="editor-placeholder__icon"><SearchX size={30} /></span>
      <p className="eyebrow">404 error</p>
      <h2 id="not-found-title">This page doesn’t exist</h2>
      <p>The address may be incorrect, or this part of the studio has not been built yet.</p>
      <ButtonLink to="/courses" variant="secondary">Return to courses</ButtonLink>
    </section>
  )
}
