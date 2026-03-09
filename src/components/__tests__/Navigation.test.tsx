import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {axe} from 'vitest-axe'
import {Navigation} from '../Navigation'

describe('Navigation smoke tests', () => {
  it('renders a nav landmark with correct aria-label', () => {
    render(<Navigation />)
    expect(screen.getByRole('navigation', {name: 'Main navigation'})).toBeDefined()
  })

  it('renders brand link targeting #about', () => {
    render(<Navigation />)
    const brand = screen.getByRole('link', {name: 'MRB'})
    expect(brand.getAttribute('href')).toBe('#about')
  })

  it('renders all four section anchor links with correct hrefs', () => {
    render(<Navigation />)
    const links = [
      {name: 'About', href: '#about'},
      {name: 'Experience', href: '#experience'},
      {name: 'Skills', href: '#skills'},
      {name: 'Contact', href: '#contact'},
    ]
    for (const {name, href} of links) {
      expect(screen.getByRole('link', {name}).getAttribute('href')).toBe(href)
    }
  })

  it('renders a list of nav links with four items', () => {
    render(<Navigation />)
    expect(screen.getByRole('list')).toBeDefined()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })
})

describe('Navigation accessibility tests', () => {
  it('Navigation has no accessibility violations', async () => {
    const {container} = render(<Navigation />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
