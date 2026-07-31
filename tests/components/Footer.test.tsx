import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import {Footer} from '../../src/components/Footer'
import {buildUmamiEventAttributes} from '../../src/utils/analytics'

const FooterWrapper = () => (
  <MemoryRouter>
    <Footer />
  </MemoryRouter>
)

describe('Footer Component', () => {
  it('renders brand details and ethos', () => {
    render(<FooterWrapper />)
    expect(screen.getByText('mrbro.dev')).toBeInTheDocument()
    expect(screen.getByText('Engineering with taste, proven in public.')).toBeInTheDocument()
  })

  it('renders copyright and dynamic year', () => {
    render(<FooterWrapper />)
    const currentYear = new Date().getFullYear()
    expect(screen.getByText(new RegExp(`© ${currentYear} Marcus R. Brown`, 'i'))).toBeInTheDocument()
  })

  it('renders original footer navigation and social links', () => {
    render(<FooterWrapper />)
    expect(screen.getByRole('link', {name: /home/i})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /projects/i})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /blog/i})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /about/i})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /github/i})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /@mrbrodev/i})).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /hello@mrbro\.dev/i})).toBeInTheDocument()
  })

  it('renders the quiet Privacy link with its approved event attributes', () => {
    render(<FooterWrapper />)
    const privacyLink = screen.getByRole('link', {name: /privacy/i})

    expect(privacyLink).toBeInTheDocument()
    expect(privacyLink).toHaveAttribute('href', '/privacy')
    expect(privacyLink).toHaveClass('footer__link--quiet')
    expect(privacyLink.closest('.footer__meta')).toBeInTheDocument()

    const privacyAttrs = buildUmamiEventAttributes('navigation', {destination: 'privacy', method: 'route_link'})
    expect(privacyLink).toHaveAttribute('data-umami-event', privacyAttrs?.['data-umami-event'])
    expect(privacyLink).toHaveAttribute('data-umami-event-destination', privacyAttrs?.['data-umami-event-destination'])
    expect(privacyLink).toHaveAttribute('data-umami-event-method', privacyAttrs?.['data-umami-event-method'])
  })
})
