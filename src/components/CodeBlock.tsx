// mrbro.dev/src/components/CodeBlock.tsx

import type {BundledLanguage} from 'shiki'
import React, {useEffect, useState} from 'react'
import {useTheme} from '../hooks/UseTheme'
import {highlightCode, isLanguageSupported} from '../utils/syntax-highlighting'

interface CodeBlockProps {
  children: string
  language?: string
  className?: string
  showLineNumbers?: boolean
  title?: string
}

/**
 * CodeBlock component with theme-aware syntax highlighting using Shiki
 */
const CodeBlock: React.FC<CodeBlockProps> = ({
  children,
  language = 'typescript',
  className = '',
  showLineNumbers = false,
  title,
}) => {
  const {getEffectiveThemeMode} = useTheme()
  const [highlightedCode, setHighlightedCode] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Determine the actual language to use
  const actualLanguage: BundledLanguage = isLanguageSupported(language) ? language : 'typescript'
  const effectiveThemeMode = getEffectiveThemeMode()

  useEffect(() => {
    const highlight = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const html = await highlightCode(children.trim(), actualLanguage, {
          theme: effectiveThemeMode,
          removeBackground: true, // We'll use CSS custom properties for background
        })
        setHighlightedCode(html)
      } catch (error_) {
        setError('Failed to highlight code')
        console.error('Code highlighting error:', error_)
      } finally {
        setIsLoading(false)
      }
    }

    highlight()
  }, [children, actualLanguage, effectiveThemeMode])

  if (isLoading) {
    return (
      <div className={`code-block code-block--loading ${className}`}>
        <div className="code-block__skeleton" aria-label="Loading syntax highlighting...">
          <pre>
            <code>{children.trim()}</code>
          </pre>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`code-block code-block--error ${className}`}>
        <pre>
          <code>{children.trim()}</code>
        </pre>
      </div>
    )
  }

  return (
    <div className={`code-block ${showLineNumbers ? 'code-block--line-numbers' : ''} ${className}`}>
      {title && (
        <div className="code-block__header">
          <span className="code-block__title">{title}</span>
          <span className="code-block__language">{actualLanguage}</span>
        </div>
      )}
      <div
        className="code-block__content"
        dangerouslySetInnerHTML={{__html: highlightedCode}}
        aria-label={`Code snippet in ${actualLanguage}`}
      />
    </div>
  )
}

export default CodeBlock
