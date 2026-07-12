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
      const content = card.querySelector<HTMLElement>('.kg-toggle-content')
      if (!header || !content) return

      // Ensure header is a proper flex row
      header.style.cssText = [
        'display:flex !important',
        'flex-direction:row !important',
        'align-items:center !important',
        'justify-content:space-between !important',
        'padding:0.85em 1.2em',
        'cursor:pointer',
        'user-select:none',
        'gap:1em',
      ].join(';')

      const heading = header.querySelector<HTMLElement>('.kg-toggle-heading')
      if (heading) heading.style.cssText = 'flex:1;margin:0;font-size:1rem;font-weight:600;'

      // Replace or create the icon
      let icon = header.querySelector<HTMLElement>('.kg-toggle-card-icon')
      if (icon) {
        icon.innerHTML = chevronSvg
      } else {
        icon = document.createElement('span')
        icon.setAttribute('aria-hidden', 'true')
        icon.innerHTML = chevronSvg
        header.appendChild(icon)
      }
      icon.style.cssText = 'flex-shrink:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;transition:transform 0.2s ease;pointer-events:none;'

      // Override Ghost's open state — always start collapsed
      card.removeAttribute('data-kg-toggle-state')
      content.style.cssText = 'overflow:hidden;max-height:0 !important;padding:0 1.2em;transition:max-height 0.3s ease,padding 0.2s ease;'

      let isOpen = false

      const toggle = () => {
        isOpen = !isOpen
        if (isOpen) {
          // temporarily remove !important lock while open
          content.style.cssText = `overflow:hidden;max-height:${content.scrollHeight}px;padding:0.85em 1.2em;transition:max-height 0.3s ease,padding 0.2s ease;`
          icon!.style.transform = 'rotate(180deg)'
        } else {
          content.style.cssText = 'overflow:hidden;max-height:0;padding:0 1.2em;transition:max-height 0.3s ease,padding 0.2s ease;'
          icon!.style.transform = 'rotate(0deg)'
        }
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

const chevronSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
