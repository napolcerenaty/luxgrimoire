'use client'

import { useEffect, useRef } from 'react'

export default function BlogPostContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const toggleCards = el.querySelectorAll<HTMLElement>('.kg-toggle-card')
    const handlers: Array<{ header: HTMLElement; fn: () => void }> = []

    toggleCards.forEach(card => {
      const header = card.querySelector<HTMLElement>('.kg-toggle-card-header')
      if (!header) return

      // Ensure closed state by default
      if (!card.dataset.kgToggleState) {
        card.dataset.kgToggleState = 'close'
      }

      // Add chevron icon if missing
      let icon = card.querySelector('.kg-toggle-card-icon')
      if (!icon) {
        icon = document.createElement('button')
        icon.className = 'kg-toggle-card-icon'
        icon.setAttribute('aria-label', 'Toggle section')
        icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
        header.appendChild(icon)
      }

      const toggle = () => {
        const isOpen = card.dataset.kgToggleState === 'open'
        card.dataset.kgToggleState = isOpen ? 'close' : 'open'
      }

      header.addEventListener('click', toggle)
      handlers.push({ header, fn: toggle })
    })

    return () => {
      handlers.forEach(({ header, fn }) => header.removeEventListener('click', fn))
    }
  }, [html])

  return (
    <div
      ref={ref}
      className="blog-post-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
