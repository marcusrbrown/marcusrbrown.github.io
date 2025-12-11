// mrbro.dev/tests/components/CodeBlock.test.tsx

import {render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import CodeBlock from '../../src/components/CodeBlock'
import {ThemeProvider} from '../../src/contexts/ThemeContext'

// Mock the syntax highlighting utility
vi.mock('../../src/utils/syntax-highlighting', () => ({
  highlightCode: vi.fn(async (code: string) => {
    return `<pre><code class="highlighted">${code}</code></pre>`
  }),
  isLanguageSupported: vi.fn((lang: string) => {
    return ['typescript', 'javascript', 'json'].includes(lang)
  }),
}))

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('CodeBlock component', () => {
  it('should render code block with default props', async () => {
    const code = 'const message = "Hello, World!"'

    renderWithTheme(<CodeBlock>{code}</CodeBlock>)

    // Should show loading state initially
    expect(screen.getByLabelText('Loading syntax highlighting...')).toBeInTheDocument()

    // Wait for highlighting to complete
    await waitFor(() => {
      expect(screen.getByLabelText('Code snippet in typescript')).toBeInTheDocument()
    })

    // Should contain the code
    expect(screen.getByText(code)).toBeInTheDocument()
  })

  it('should render with custom language', async () => {
    const code = '{"name": "test"}'

    renderWithTheme(<CodeBlock language="json">{code}</CodeBlock>)

    await waitFor(() => {
      expect(screen.getByLabelText('Code snippet in json')).toBeInTheDocument()
    })
  })

  it('should render with title and language display', async () => {
    const code = 'console.log("test")'
    const title = 'Example JavaScript'

    renderWithTheme(
      <CodeBlock language="javascript" title={title}>
        {code}
      </CodeBlock>,
    )

    await waitFor(() => {
      expect(screen.getByText(title)).toBeInTheDocument()
      expect(screen.getByText('javascript')).toBeInTheDocument()
    })
  })

  it('should handle line numbers', async () => {
    const code = 'const a = 1\nconst b = 2'

    renderWithTheme(<CodeBlock showLineNumbers={true}>{code}</CodeBlock>)

    await waitFor(() => {
      const codeBlock = screen.getByLabelText('Code snippet in typescript')
      expect(codeBlock.closest('.code-block')).toHaveClass('code-block--line-numbers')
    })
  })

  it('should handle empty code', async () => {
    renderWithTheme(<CodeBlock></CodeBlock>)

    await waitFor(() => {
      expect(screen.getByLabelText('Code snippet in typescript')).toBeInTheDocument()
    })
  })

  it('should apply custom className', async () => {
    const customClass = 'my-custom-class'

    renderWithTheme(<CodeBlock className={customClass}>test</CodeBlock>)

    await waitFor(() => {
      const codeBlock = screen.getByLabelText('Code snippet in typescript')
      expect(codeBlock.closest('.code-block')).toHaveClass(customClass)
    })
  })
})
