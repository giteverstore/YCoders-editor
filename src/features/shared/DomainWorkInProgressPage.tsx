import { Link } from 'react-router-dom'

export function DomainWorkInProgressPage({ domain }: { domain: string }) {
  return (
    <section className="page-stack" aria-labelledby="domain-wip-title">
      <div className="page-heading">
        <p className="eyebrow">Work in Progress</p>
        <h2 id="domain-wip-title">{domain} are not available in this release</h2>
        <p>This workspace is being prepared. Courses and Practice remain available.</p>
        <Link to="/courses">Go to Courses</Link>
      </div>
    </section>
  )
}
