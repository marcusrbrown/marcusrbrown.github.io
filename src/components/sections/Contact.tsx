import React from 'react'
import {useScrollReveal} from '../../hooks/UseScrollReveal'

export const Contact: React.FC = () => {
  const {ref, isVisible} = useScrollReveal()

  return (
    <section ref={ref} id="contact" className={`brand-section fade-in-on-scroll ${isVisible ? 'is-visible' : ''}`}>
      <div className="container">
        <h2 className={`brand-section-title text-reveal ${isVisible ? 'is-visible' : ''}`}>Contact</h2>
        <div className="brand-contact-content">
          <p>20+ years across gaming, enterprise, and blockchain. Let's build something.</p>
          <div className="contact-info">
            <div className="contact-method">
              <h3>Email</h3>
              <a href="mailto:vc@mrbro.dev" className="contact-link subtle-hover-lift">
                vc@mrbro.dev
              </a>
            </div>
            <div className="contact-social">
              <h3>Links</h3>
              <ul className="social-links">
                <li>
                  <a
                    href="https://linkedin.com/in/marcusrbrown"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="subtle-hover-lift"
                    aria-label="Visit Marcus R. Brown on LinkedIn"
                  >
                    LinkedIn
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/marcusrbrown"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="subtle-hover-lift"
                    aria-label="View Marcus R. Brown's GitHub profile"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="https://mrbro.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="subtle-hover-lift"
                    aria-label="Visit Marcus R. Brown's portfolio at mrbro.dev"
                  >
                    Portfolio (mrbro.dev)
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
