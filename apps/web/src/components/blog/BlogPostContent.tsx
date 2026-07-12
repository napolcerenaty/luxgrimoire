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

      // Fix header layout inline — overrides any Ghost default styles
      header.style.cssText = `
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 0.85em 1.2em;
        cursor: pointer;
        user-select: none;
        gap: 1em;
      `

      // Fix heading inline
      const heading = header.querySelector<HTMLElement>('.kg-toggle-heading')
      if (heading) {
        heading.style.cssText = 'flex: 1; margin: 0; font-size: 1rem; font-weight: 600;'
      }

      // Handle Ghost's existing icon OR add our own
      let iconBtn = header.querySelector<HTMLElement>('.kg-toggle-card-icon')
      if (iconBtn) {
        // Replace Ghost's SVG (circle arrow) with simple chevron
        iconBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
        iconBtn.style.cssText = 'flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; padding: 0; transition: transform 0.2s ease; color: inherit;'
      } else {
        iconBtn = document.createElement('button')
        iconBtn.setAttribute('aria-label', 'Toggle section')
        iconBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
        iconBtn.style.cssText = 'flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; padding: 0; transition: transform 0.2s ease; color: inherit;'
        header.appendChild(iconBtn)
      }

      // Hide content initially via inline style (overrides any defaults)
      content.style.cssText = 'overflow: hidden; max-height: 0; padding: 0 1.2em; transition: max-height 0.3s ease, padding 0.2s ease;'

      let isOpen = false

      const toggle = () => {
        isOpen = !isOpen
        if (isOpen) {
          content.style.maxHeight = content.scrollHeight + 'px'
          content.style.padding = '0.85em 1.2em'
          iconBtn!.style.transform = 'rotate(180deg)'
        } else {
          content.style.maxHeight = '0'
          content.style.padding = '0 1.2em'
          iconBtn!.style.transform = 'rotate(0deg)'
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
