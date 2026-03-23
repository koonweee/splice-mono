import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './ask.module.css'

type AskMarkdownProps = {
  markdown: string
}

const allowedElements = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const

function isSafeHref(href?: string): href is string {
  if (!href) {
    return false
  }

  const trimmedHref = href.trim()
  if (!trimmedHref) {
    return false
  }

  if (trimmedHref.startsWith('//')) {
    return false
  }

  if (trimmedHref.startsWith('#') || trimmedHref.startsWith('/')) {
    return true
  }

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmedHref)) {
    return true
  }

  try {
    const { protocol } = new URL(trimmedHref)
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:'
  } catch {
    return false
  }
}

export function AskMarkdown({ markdown }: AskMarkdownProps) {
  if (!markdown.trim()) {
    return null
  }

  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={allowedElements}
        unwrapDisallowed
        components={{
          a: ({ href, children, node: _node, ...props }) => {
            if (!isSafeHref(href)) {
              return <>{children}</>
            }

            return (
              <a href={href} {...props}>
                {children}
              </a>
            )
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
