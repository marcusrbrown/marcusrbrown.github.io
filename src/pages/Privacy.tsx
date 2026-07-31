import React from 'react'
import {usePageTitle} from '../hooks/UsePageTitle'
import {UMAMI_EVENT_PRIVACY_METADATA} from '../utils/analytics'

interface PrivacyProps {
  isEnabled?: boolean
}

export const Privacy: React.FC<PrivacyProps> = ({isEnabled = __UMAMI_ENABLED__}) => {
  usePageTitle('Privacy')

  return (
    <article className="privacy-page container">
      <header className="privacy-page__header">
        <h1 className="privacy-page__title">Privacy &amp; analytics disclosure</h1>
      </header>

      <section className="privacy-page__section" aria-labelledby="status-heading">
        <h2 id="status-heading" className="privacy-page__section-title">
          Current status
        </h2>
        <div className="privacy-page__status-prose">
          {isEnabled ? (
            <p>
              Analytics are enabled for this build. Records are retained no longer than 13 months and are subject to the
              limits described below.
            </p>
          ) : (
            <p>
              Analytics are disabled for this build. No tracker script is loaded, no pageview is sent, and no custom
              event is sent.
            </p>
          )}
        </div>
      </section>

      <section className="privacy-page__section" aria-labelledby="collection-heading">
        <h2 id="collection-heading" className="privacy-page__section-title">
          What analytics collects — and what it does not
        </h2>
        <p>When enabled, the self-hosted open-source Umami integration records:</p>
        <ul className="privacy-page__list">
          <li>The normalized pathname without query or hash.</li>
          <li>Coarse browser, operating system, device, referrer, and viewport metadata supplied by Umami.</li>
          <li>Approximate country, region, and city derived locally from the IP address.</li>
          <li>
            A one-way monthly-rotating visitor hash. The raw IP is not stored, and the hash cannot be reversed to
            recover it.
          </li>
          <li>
            Approved categorical interaction events, including standard theme mode and preset IDs. Custom user-authored
            theme values are not collected.
          </li>
        </ul>

        <h3 className="privacy-page__subsection-title">Never collected</h3>
        <ul className="privacy-page__list">
          <li>Cookies.</li>
          <li>Names, email addresses, or user-authored text.</li>
          <li>Raw URLs, query strings, or URL hashes.</li>
          <li>Stored raw IP addresses.</li>
          <li>Identifiers persistent across months.</li>
          <li>Fingerprinting.</li>
          <li>Cross-site tracking, data sharing, or sale.</li>
          <li>Error strings or search queries.</li>
          <li>Custom user-authored theme values.</li>
        </ul>
      </section>

      <section className="privacy-page__section" aria-labelledby="dnt-heading">
        <h2 id="dnt-heading" className="privacy-page__section-title">
          Do Not Track
        </h2>
        <p>
          In an enabled build, the tracker script may load when Do Not Track is enabled, but no pageview or custom event
          is sent. A disabled build sends nothing.
        </p>
      </section>

      <section className="privacy-page__section" aria-labelledby="retention-heading">
        <h2 id="retention-heading" className="privacy-page__section-title">
          Processing and retention
        </h2>
        <ul className="privacy-page__list">
          {isEnabled ? (
            <li>When enabled, records are retained no longer than 13 months.</li>
          ) : (
            <li>
              Analytics stays off until the 13-month retention policy has current version-controlled verification.
              Deployment configuration and the operator control activation.
            </li>
          )}
          <li>
            A change to ownership, processing, or retention invalidates the current evidence and requires a disabled
            state until it is reverified.
          </li>
        </ul>
      </section>

      <section className="privacy-page__section" aria-labelledby="events-heading">
        <h2 id="events-heading" className="privacy-page__section-title">
          Approved event inventory
        </h2>
        <p>
          This is the complete inventory of approved categorical interaction events. No other custom event families are
          collected.
        </p>
        <dl className="privacy-page__dl">
          {UMAMI_EVENT_PRIVACY_METADATA.map(({name, description}) => (
            <div key={name} className="privacy-page__dl-item">
              <dt className="privacy-page__dt">{name.replaceAll('_', ' ')}</dt>
              <dd className="privacy-page__dd">{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="privacy-page__section" aria-labelledby="operator-heading">
        <h2 id="operator-heading" className="privacy-page__section-title">
          Operator/service details
        </h2>
        <p>
          Analytics use a self-hosted open-source Umami instance at{' '}
          <a href="https://metrics.fro.bot" target="_blank" rel="noopener noreferrer">
            metrics.fro.bot
          </a>
          . Infrastructure is controlled by Marcus R. Brown. No third-party analytics processor is used, and data is not
          shared or sold.
        </p>
        <p>
          Contact messages are not sent to analytics. Questions about this disclosure can be raised through{' '}
          <a
            href="https://github.com/marcusrbrown/marcusrbrown.github.io/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Issues
          </a>{' '}
          or <a href="mailto:hello@mrbro.dev">hello@mrbro.dev</a>.
        </p>
      </section>
    </article>
  )
}
