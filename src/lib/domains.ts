import type { LucideIcon } from 'lucide-react'
import { BookOpen, Braces, Dumbbell, Rocket } from 'lucide-react'

export type DomainDefinition = {
  singular: string
  plural: string
  slug: string
  description: string
  icon: LucideIcon
}

export const domains: DomainDefinition[] = [
  {
    singular: 'Course',
    plural: 'Courses',
    slug: 'courses',
    description: 'Build structured learning paths from foundational concepts to complete curricula.',
    icon: BookOpen,
  },
  {
    singular: 'Practice set',
    plural: 'Practice',
    slug: 'practice',
    description: 'Create focused exercises that help learners reinforce skills through repetition.',
    icon: Dumbbell,
  },
  {
    singular: 'Challenge',
    plural: 'Challenges',
    slug: 'challenges',
    description: 'Design goal-oriented problems that assess understanding and creative thinking.',
    icon: Braces,
  },
  {
    singular: 'Project',
    plural: 'Projects',
    slug: 'projects',
    description: 'Author hands-on experiences where learners apply their skills to meaningful outcomes.',
    icon: Rocket,
  },
]

export function getDomainFromPath(pathname: string) {
  return domains.find((domain) => pathname.startsWith(`/${domain.slug}`))
}
