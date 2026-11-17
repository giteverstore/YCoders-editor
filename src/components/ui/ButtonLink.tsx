import { ArrowRight, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type ButtonLinkProps = {
  to: string
  children: ReactNode
  icon?: 'plus' | 'arrow'
  variant?: 'primary' | 'secondary'
}

export function ButtonLink({ to, children, icon = 'arrow', variant = 'primary' }: ButtonLinkProps) {
  const Icon = icon === 'plus' ? Plus : ArrowRight
  return <Link className={`button button--${variant}`} to={to}>{children}<Icon size={17} aria-hidden="true" /></Link>
}
