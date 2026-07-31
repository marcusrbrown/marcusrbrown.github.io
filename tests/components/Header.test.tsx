import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import Header from '../../src/components/Header'
import {ThemeProvider} from '../../src/contexts/ThemeContext'
import {buildUmamiEventAttributes} from '../../src/utils/analytics'

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

  it('applies analytics attributes to all header route links', () => {
    render(<HeaderWrapper />)
    const homeLink = screen.getByRole('link', {name: /home/i})
    const blogLink = screen.getByRole('link', {name: /blog/i})
    const projectsLink = screen.getByRole('link', {name: /projects/i})
    const aboutLink = screen.getByRole('link', {name: /about/i})
    const titleLink = screen.getByRole('link', {name: /mrbro\.dev/i})

    const homeAttrs = buildUmamiEventAttributes('navigation', {destination: 'home', method: 'route_link'})
    const blogAttrs = buildUmamiEventAttributes('navigation', {destination: 'blog', method: 'route_link'})
    const projectsAttrs = buildUmamiEventAttributes('navigation', {destination: 'projects', method: 'route_link'})
    const aboutAttrs = buildUmamiEventAttributes('navigation', {destination: 'about', method: 'route_link'})

    expect(homeLink).toHaveAttribute('data-umami-event', homeAttrs?.['data-umami-event'])
    expect(homeLink).toHaveAttribute('data-umami-event-destination', homeAttrs?.['data-umami-event-destination'])
    expect(homeLink).toHaveAttribute('data-umami-event-method', homeAttrs?.['data-umami-event-method'])

    expect(blogLink).toHaveAttribute('data-umami-event', blogAttrs?.['data-umami-event'])
    expect(blogLink).toHaveAttribute('data-umami-event-destination', blogAttrs?.['data-umami-event-destination'])
    expect(blogLink).toHaveAttribute('data-umami-event-method', blogAttrs?.['data-umami-event-method'])

    expect(projectsLink).toHaveAttribute('data-umami-event', projectsAttrs?.['data-umami-event'])
    expect(projectsLink).toHaveAttribute(
      'data-umami-event-destination',
      projectsAttrs?.['data-umami-event-destination'],
    )
    expect(projectsLink).toHaveAttribute('data-umami-event-method', projectsAttrs?.['data-umami-event-method'])

    expect(aboutLink).toHaveAttribute('data-umami-event', aboutAttrs?.['data-umami-event'])
    expect(aboutLink).toHaveAttribute('data-umami-event-destination', aboutAttrs?.['data-umami-event-destination'])
    expect(aboutLink).toHaveAttribute('data-umami-event-method', aboutAttrs?.['data-umami-event-method'])

    expect(titleLink).toHaveAttribute('data-umami-event', homeAttrs?.['data-umami-event'])
    expect(titleLink).toHaveAttribute('data-umami-event-destination', homeAttrs?.['data-umami-event-destination'])
    expect(titleLink).toHaveAttribute('data-umami-event-method', homeAttrs?.['data-umami-event-method'])
  })
})
