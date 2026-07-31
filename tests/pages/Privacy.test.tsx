import {render, screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe, expect, it} from 'vitest'
import {Privacy} from '../../src/pages/Privacy'
import {UMAMI_EVENT_PRIVACY_METADATA} from '../../src/utils/analytics'

const PrivacyWrapper = ({isEnabled}: {isEnabled: boolean}) => (
  <MemoryRouter>
    <Privacy isEnabled={isEnabled} />
  </MemoryRouter>
)

describe('Privacy Page Component', () => {
  it('renders one heading and no nested main landmark', () => {
    render(<PrivacyWrapper isEnabled={false} />)

    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1)
    expect(screen.getByRole('heading', {level: 1, name: /privacy/i})).toBeInTheDocument()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })

  it('renders disabled status without active retention claims', () => {
    const {container} = render(<PrivacyWrapper isEnabled={false} />)
    const statusProse = container.querySelector('.privacy-page__status-prose')

    expect(statusProse).toBeInTheDocument()
    expect(statusProse).toHaveTextContent(/analytics are disabled/i)
    expect(statusProse).toHaveTextContent(/no tracker script/i)
    expect(statusProse).toHaveTextContent(/no pageview/i)
    expect(statusProse).toHaveAttribute('data-analytics-state', 'disabled')

    const statusLead = statusProse?.querySelector('strong')
    expect(statusLead).toBeInTheDocument()
    expect(statusLead).toHaveTextContent('Analytics are disabled for this build.')

    const retention = container.querySelector('#retention-heading')?.parentElement
    expect(retention).toHaveTextContent(
      'Analytics remains disabled until version-controlled evidence proves both controls.',
    )
    expect(retention).toHaveTextContent(
      'Deployment configuration alone does not activate collection; the operator controls activation.',
    )
    expect(retention).not.toHaveTextContent(
      'Pageview and custom-interaction records are retained no longer than 13 months.',
    )
    expect(retention).not.toHaveTextContent(
      'Monthly session parent records remain only while they support retained events',
    )
  })

  it('renders enabled status and conditional retention policy', () => {
    const {container} = render(<PrivacyWrapper isEnabled={true} />)
    const statusProse = container.querySelector('.privacy-page__status-prose')

    expect(statusProse).toBeInTheDocument()
    expect(statusProse).toHaveTextContent(/analytics are enabled/i)
    expect(statusProse).toHaveTextContent(
      'Pageview and custom-interaction records are retained no longer than 13 months.',
    )
    expect(statusProse).toHaveTextContent(
      'Monthly session parent rows persist only until the last retained child expires.',
    )
    expect(statusProse).toHaveTextContent(
      "Under Umami's monthly model, this bounds session data to less than 14 months.",
    )
    expect(statusProse).toHaveAttribute('data-analytics-state', 'enabled')

    const statusLead = statusProse?.querySelector('strong')
    expect(statusLead).toBeInTheDocument()
    expect(statusLead).toHaveTextContent('Analytics are enabled for this build.')

    const retention = container.querySelector('#retention-heading')?.parentElement
    expect(retention).toHaveTextContent(
      'Pageview and custom-interaction records are retained no longer than 13 months.',
    )
    expect(retention).toHaveTextContent(
      "Monthly session parent records remain only while they support retained events and are removed after the last retained child expires—less than 14 months under Umami's monthly session model.",
    )
  })

  it('renders the sections in the published order', () => {
    render(<PrivacyWrapper isEnabled={false} />)

    expect(screen.getAllByRole('heading', {level: 2}).map(heading => heading.textContent)).toEqual([
      'Current status',
      'What analytics collects — and what it does not',
      'Do Not Track',
      'Processing and retention',
      'Approved event inventory',
      'Operator/service details',
    ])
  })

  it('renders collection subgroups in order', () => {
    render(<PrivacyWrapper isEnabled={false} />)

    expect(screen.getAllByRole('heading', {level: 3}).map(heading => heading.textContent)).toEqual([
      'Collected when enabled',
      'Never collected',
    ])
  })

  it('pairs every level-two section with exactly one section body wrapper', () => {
    render(<PrivacyWrapper isEnabled={false} />)

    expect(document.querySelectorAll('.privacy-page__section-body')).toHaveLength(6)

    screen.getAllByRole('heading', {level: 2}).forEach(heading => {
      const section = heading.closest('section')
      expect(section).toBeInTheDocument()

      if (section === null) return

      expect(section.querySelectorAll('.privacy-page__section-body')).toHaveLength(1)
    })
  })

  it('renders approved event inventory exactly once from the metadata', () => {
    render(<PrivacyWrapper isEnabled={true} />)

    const inventory = document.querySelector('.privacy-page__dl')
    expect(inventory).toBeInTheDocument()
    expect(inventory?.querySelectorAll('dt')).toHaveLength(UMAMI_EVENT_PRIVACY_METADATA.length)
    expect(inventory?.querySelectorAll('dd')).toHaveLength(UMAMI_EVENT_PRIVACY_METADATA.length)

    const labels = Array.from(inventory?.querySelectorAll('dt') ?? [], element => element.textContent)
    const descriptions = Array.from(inventory?.querySelectorAll('dd') ?? [], element => element.textContent)
    UMAMI_EVENT_PRIVACY_METADATA.forEach(event => {
      const label = event.name.replaceAll('_', ' ')
      expect(labels).toContain(label)
      expect(descriptions.filter(description => description === event.description)).toHaveLength(1)
    })
  })

  it('does not render stale event families in the inventory', () => {
    render(<PrivacyWrapper isEnabled={false} />)

    const dlElement = document.querySelector('.privacy-page__dl')
    const staleFamilies = ['search', 'error', 'performance', 'download', 'skill', 'hover', 'session', 'consent']
    staleFamilies.forEach(family => {
      expect(dlElement).not.toHaveTextContent(new RegExp(String.raw`\b${family}\b`, 'i'))
    })
  })

  it('describes the bounded collection and operator details', () => {
    render(<PrivacyWrapper isEnabled={true} />)

    expect(document.body).toHaveTextContent(/normalized pathname without query or hash/i)
    expect(document.body).toHaveTextContent(/browser, operating system, device, referrer, and viewport/i)
    expect(document.body).toHaveTextContent(/approximate country, region, and city/i)
    expect(document.body).toHaveTextContent(/one-way monthly-rotating visitor hash/i)
    expect(document.body).toHaveTextContent(/standard theme mode and preset ids/i)
    expect(document.body).toHaveTextContent(/raw ip is not stored/i)
    expect(document.body).toHaveTextContent(/hash cannot be reversed/i)
    expect(document.body).toHaveTextContent(/metrics\.fro\.bot/i)
    expect(document.body).toHaveTextContent(/no third-party analytics processor/i)
    expect(document.body).toHaveTextContent(/contact messages are not sent to analytics/i)

    const githubLink = screen.getByRole('link', {name: /github/i})
    expect(githubLink).toHaveAttribute('href', expect.stringContaining('github.com'))

    const mailLink = screen.getByRole('link', {name: /hello@mrbro\.dev/i})
    expect(mailLink).toHaveAttribute('href', 'mailto:hello@mrbro.dev')
  })
})
