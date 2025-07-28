import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import Header from '../../src/components/Header'

describe('Header Component', () => {
  it('renders the site title', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    const titleElement = screen.getByText(/my portfolio/i)
    expect(titleElement).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    const homeLink = screen.getByRole('link', {name: /home/i})
    const blogLink = screen.getByRole('link', {name: /blog/i})
    const projectsLink = screen.getByRole('link', {name: /projects/i})
    const aboutLink = screen.getByRole('link', {name: /about/i})

    expect(homeLink).toBeInTheDocument()
    expect(blogLink).toBeInTheDocument()
    expect(projectsLink).toBeInTheDocument()
    expect(aboutLink).toBeInTheDocument()
  })
})
