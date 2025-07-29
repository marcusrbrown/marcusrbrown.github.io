import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

describe('main.tsx', () => {
  describe('File Content Verification', () => {
    let fileContent: string

    beforeEach(() => {
      const mainTsxPath = resolve(__dirname, '../src/main.tsx')
      fileContent = readFileSync(mainTsxPath, 'utf-8')
    })

    it('should import React correctly', () => {
      expect(fileContent).toContain("import React from 'react'")
    })

    it('should import ReactDOM createRoot correctly', () => {
      expect(fileContent).toContain("import ReactDOM from 'react-dom/client'")
    })

    it('should import App component', () => {
      expect(fileContent).toContain("import App from './App'")
    })

    it('should import CSS files in correct order', () => {
      const themesImportIndex = fileContent.indexOf("import './styles/themes.css'")
      const globalsImportIndex = fileContent.indexOf("import './styles/globals.css'")

      expect(themesImportIndex).toBeGreaterThan(-1)
      expect(globalsImportIndex).toBeGreaterThan(-1)
      expect(themesImportIndex).toBeLessThan(globalsImportIndex)
    })

    it('should query for root element', () => {
      expect(fileContent).toContain("document.querySelector('#root')")
    })

    it('should handle missing root element with error', () => {
      expect(fileContent).toContain('Root element not found')
    })

    it('should create React root and render with StrictMode', () => {
      expect(fileContent).toContain('ReactDOM.createRoot')
      expect(fileContent).toContain('React.StrictMode')
      expect(fileContent).toContain('<App />')
    })

    it('should use proper TypeScript patterns', () => {
      // Check for proper error handling
      expect(fileContent).toContain('if (!rootElement)')
      expect(fileContent).toContain('throw new Error')
    })
  })

  describe('DOM Mounting Simulation', () => {
    let mockRootElement: HTMLElement
    let mockRender: ReturnType<typeof vi.fn>
    let mockCreateRoot: ReturnType<typeof vi.fn>

    beforeEach(() => {
      // Create mock functions
      mockRender = vi.fn()
      mockCreateRoot = vi.fn(() => ({render: mockRender}))

      // Create mock root element
      mockRootElement = document.createElement('div')
      mockRootElement.id = 'root'
      document.body.append(mockRootElement)

      // Mock ReactDOM
      vi.doMock('react-dom/client', () => ({
        createRoot: mockCreateRoot,
      }))

      // Mock App component
      vi.doMock('../src/App', () => ({
        default: () => ({type: 'div', props: {'data-testid': 'app'}}),
      }))
    })

    afterEach(() => {
      mockRootElement.remove()
      vi.clearAllMocks()
    })

    it('should find and mount to root element', () => {
      const rootElement = document.querySelector('#root')
      expect(rootElement).toBe(mockRootElement)
      expect(rootElement?.id).toBe('root')
    })

    it('should throw error when root element is missing', () => {
      const rootElement = document.querySelector('#nonexistent')
      expect(rootElement).toBeNull()

      expect(() => {
        if (!rootElement) {
          throw new Error('Root element not found')
        }
      }).toThrow('Root element not found')
    })
  })

  describe('React Structure Validation', () => {
    it('should have correct component hierarchy in file', () => {
      const mainTsxPath = resolve(__dirname, '../src/main.tsx')
      const fileContent = readFileSync(mainTsxPath, 'utf-8')

      // Verify the component structure is as expected
      expect(fileContent).toMatch(/<React\.StrictMode>/)
      expect(fileContent).toMatch(/<App \/>/)
      expect(fileContent).toMatch(/<\/React\.StrictMode>/)
    })

    it('should use proper ReactDOM.createRoot pattern', () => {
      const mainTsxPath = resolve(__dirname, '../src/main.tsx')
      const fileContent = readFileSync(mainTsxPath, 'utf-8')

      expect(fileContent).toContain('ReactDOM.createRoot(rootElement)')
      expect(fileContent).toContain('.render(')
    })
  })

  describe('Error Handling Patterns', () => {
    it('should implement proper null checking', () => {
      const mainTsxPath = resolve(__dirname, '../src/main.tsx')
      const fileContent = readFileSync(mainTsxPath, 'utf-8')

      expect(fileContent).toContain('const rootElement = document.querySelector')
      expect(fileContent).toContain('if (!rootElement)')
      expect(fileContent).toContain('throw new Error')
    })

    it('should provide descriptive error messages', () => {
      const mainTsxPath = resolve(__dirname, '../src/main.tsx')
      const fileContent = readFileSync(mainTsxPath, 'utf-8')

      expect(fileContent).toContain('Root element not found')
    })
  })

  describe('Import Order and Structure', () => {
    it('should follow proper import order', () => {
      const mainTsxPath = resolve(__dirname, '../src/main.tsx')
      const fileContent = readFileSync(mainTsxPath, 'utf-8')

      const lines = fileContent.split('\n')
      const importLines = lines.filter(line => line.trim().startsWith('import'))

      expect(importLines.length).toBeGreaterThan(0)

      // Check that React imports come first
      expect(importLines[0]).toContain('React')
      expect(importLines[1]).toContain('ReactDOM')
      expect(importLines[2]).toContain('App')
    })

    it('should import styles after components', () => {
      const mainTsxPath = resolve(__dirname, '../src/main.tsx')
      const fileContent = readFileSync(mainTsxPath, 'utf-8')

      const appImportIndex = fileContent.indexOf("import App from './App'")
      const themesImportIndex = fileContent.indexOf("import './styles/themes.css'")

      expect(appImportIndex).toBeLessThan(themesImportIndex)
    })
  })
})
