'use client'

import { useEffect, useRef } from 'react'

export default function BlogPostContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const toggleCards = el.querySelectorAll<HTMLElement>('.kg-toggle-card')

    toggleCards.forEach(card => {
      // Be resilient to whatever Ghost structure was rendered
      const contentEl = card.querySelector<HTMLElement>('.kg-toggle-content')
      const headingEl = card.querySelector<HTMLElement>('.kg-toggle-heading, h4, h3, h2')
      if (!contentEl || !headingEl) return

      // Save content HTML, then rebuild the card from scratch
      const contentHTML = contentEl.innerHTML

      // Build header row
      const header = document.createElement('div')
      header.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'padding:0.85em 1.2em',
        'cursor:pointer',
        'user-select:none',
        'gap:1em',
        'border-radius:8px 8px 0 0',
      ].join(';')

      const title = document.createElement('span')
      title.textContent = headingEl.textContent ?? ''
      title.style.cssText = 'flex:1;font-size:1rem;font-weight:600;font-family:var(--font-serif,serif);color:var(--text-bright);'

      const icon = document.createElement('span')
      icon.setAttribute('aria-hidden', 'true')
      icon.innerHTML = CHEVRON_SVG
      icon.style.cssText = 'flex-shrink:0;width:22px;height:22px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);transition:transform 0.2s ease;'

      header.appendChild(title)
      header.appendChild(icon)

      // Build content wrapper
      const content = document.createElement('div')
      content.innerHTML = contentHTML
      content.style.cssText = 'overflow:hidden;max-height:0;padding:0 1.2em;transition:max-height 0.3s ease,padding 0.2s ease;'

      // Rebuild card
      card.innerHTML = ''
      card.appendChild(header)
      card.appendChild(content)

      let isOpen = false
      header.addEventListener('click', () => {
        isOpen = !isOpen
        content.style.cssText = isOpen
          ? `overflow:hidden;max-height:${content.scrollHeight + 32}px;padding:0.85em 1.2em;transition:max-height 0.3s ease,padding 0.2s ease;`
          : 'overflow:hidden;max-height:0;padding:0 1.2em;transition:max-height 0.3s ease,padding 0.2s ease;'
        icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
      })
    })
  }, [html])

  return (
    <div
      ref={ref}
      className="blog-post-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

const CHEVRON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
