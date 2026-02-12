'use client'

import { Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExamplePromptsProps {
  onSelect: (prompt: string) => void
}

const EXAMPLES = [
  {
    title: 'Coffee Shop Landing Page',
    description: 'A warm, inviting page with menu highlights and location info',
    prompt:
      'Create a beautiful landing page for a specialty coffee shop called "Bean & Brew". Include a hero section with a warm photo placeholder, featured drinks with prices, customer testimonials, store hours, and a cozy color scheme with browns and creams.',
  },
  {
    title: 'Portfolio Website',
    description: 'A clean, modern portfolio to showcase your work',
    prompt:
      'Create a modern portfolio website for a freelance designer. Include a hero section with a bold introduction, a project gallery grid with image placeholders, an about section, skills list, and a contact form. Use a minimal black and white design with one accent color.',
  },
  {
    title: 'SaaS Pricing Page',
    description: 'A conversion-focused pricing page with plan comparison',
    prompt:
      'Create a SaaS pricing page with three tiers: Starter ($9/mo), Pro ($29/mo), and Enterprise (custom). Include feature comparison, a highlighted recommended plan, FAQ accordion section, and a clean professional design with blue tones.',
  },
  {
    title: 'Restaurant Menu',
    description: 'An elegant digital menu with categories and prices',
    prompt:
      'Create an elegant restaurant menu page for an Italian restaurant called "La Bella Cucina". Include sections for appetizers, pasta, main courses, desserts, and drinks. Each item should have a name, description, and price. Use a sophisticated dark background with gold accents.',
  },
  {
    title: 'Event Invitation',
    description: 'A beautiful invitation page for a special occasion',
    prompt:
      'Create a wedding invitation webpage for "Sarah & James". Include the date (June 15, 2025), venue details with a map placeholder, event schedule, RSVP form, dress code info, and a romantic floral design with soft pink and sage green colors.',
  },
  {
    title: 'Blog Homepage',
    description: 'A content-rich blog layout with featured articles',
    prompt:
      'Create a blog homepage for a tech blog called "Digital Frontiers". Include a featured post hero section, a grid of recent article cards with image placeholders, categories sidebar, newsletter signup form, and a modern design with dark mode aesthetics.',
  },
]

export function ExamplePrompts({ onSelect }: ExamplePromptsProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <Lightbulb className="size-5 text-primary" />
        </div>
        <h3 className="text-base font-medium">What would you like to build?</h3>
        <p className="text-sm text-muted-foreground">
          Choose an example or type your own prompt below
        </p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-2 gap-3">
        {EXAMPLES.map((example) => (
          <button
            key={example.title}
            className={cn(
              'flex flex-col gap-1 rounded-lg border bg-background p-3 text-left',
              'transition-all hover:border-primary/50 hover:shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            onClick={() => onSelect(example.prompt)}
          >
            <span className="text-sm font-medium">{example.title}</span>
            <span className="text-xs text-muted-foreground line-clamp-2">
              {example.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
