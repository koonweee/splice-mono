import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './ask.module.css'

type AskMarkdownProps = {
  markdown: string
}

export function AskMarkdown({ markdown }: AskMarkdownProps) {
  if (!markdown.trim()) {
    return null
  }

  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}
