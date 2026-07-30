import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import Header from '../../src/components/Header'
import {ThemeProvider} from '../../src/contexts/ThemeContext'

const HeaderWrapper: React.FC<{initialEntries?: string[]}> = ({initialEntries = ['/']}) => (
  <MemoryRouter initialEntries={initialEntries}>
    <ThemeProvider>
      <Header />
    </ThemeProvider>
  </MemoryRouter>
)

describe('Header Component', () => {
  it('renders the site title', () => {
    render(<HeaderWrapper />)
    const titleElement = screen.getByText(/mrbro\.dev/i)
    expect(titleElement).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<HeaderWrapper />)
    const homeLink = screen.getByRole('link', {name: /home/i})
    const blogLink = screen.getByRole('link', {name: /blog/i})
    const projectsLink = screen.getByRole('link', {name: /projects/i})
    const aboutLink = screen.getByRole('link', {name: /about/i})

    expect(homeLink).toBeInTheDocument()
    expect(blogLink).toBeInTheDocument()
    expect(projectsLink).toBeInTheDocument()
    expect(aboutLink).toBeInTheDocument()
  })

  it('renders theme toggle', () => {
    render(<HeaderWrapper />)
    const themeToggle = screen.getByRole('button')
    expect(themeToggle).toBeInTheDocument()
  })

  it('marks the active nav link with aria-current="page" for the current route', () => {
    render(<HeaderWrapper initialEntries={['/projects']} />)

    const projectsLink = screen.getByRole('link', {name: /projects/i})
    const homeLink = screen.getByRole('link', {name: /home/i})
    const blogLink = screen.getByRole('link', {name: /blog/i})
    const aboutLink = screen.getByRole('link', {name: /about/i})

    expect(projectsLink).toHaveAttribute('aria-current', 'page')
    expect(homeLink).not.toHaveAttribute('aria-current')
    expect(blogLink).not.toHaveAttribute('aria-current')
    expect(aboutLink).not.toHaveAttribute('aria-current')
  })
})
