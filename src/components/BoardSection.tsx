import { useState, type ReactNode } from 'react'

type BoardSectionProps = {
  title: string
  titleId: string
  collapsible: boolean
  children: ReactNode
}

export function BoardSection({ title, titleId, collapsible, children }: BoardSectionProps) {
  const [open, setOpen] = useState(false)
  const expanded = !collapsible || open
  const panelId = `${titleId}-panel`

  return (
    <section className="board-section" aria-labelledby={titleId}>
      <h2 id={titleId} className="section-title">
        {collapsible ? (
          <button
            type="button"
            className="section-toggle"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            <span>{title}</span>
            <svg
              className={expanded ? 'section-chevron is-open' : 'section-chevron'}
              viewBox="0 0 24 24"
              width="24"
              height="24"
              aria-hidden="true"
            >
              <path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
            </svg>
          </button>
        ) : (
          title
        )}
      </h2>
      <div id={panelId} hidden={!expanded}>
        {children}
      </div>
    </section>
  )
}
