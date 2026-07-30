import {Link} from 'react-router-dom'
import {buildUmamiEventAttributes} from '../utils/analytics'

export const Footer = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="footer__container">
        <div className="footer__main">
          <div className="footer__brand">
            <span className="footer__wordmark">mrbro.dev</span>
            <p className="footer__ethos">Engineering with taste, proven in public.</p>
          </div>
          <div className="footer__groups">
            <div className="footer__group">
              <span className="footer__group-label">Navigation</span>
              <nav aria-label="Footer navigation">
                <ul className="footer__links-list">
                  <li>
                    <Link
                      to="/"
                      className="footer__link"
                      {...buildUmamiEventAttributes('navigation', {destination: 'home', method: 'route_link'})}
                    >
                      Home
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/projects"
                      className="footer__link"
                      {...buildUmamiEventAttributes('navigation', {destination: 'projects', method: 'route_link'})}
                    >
                      Projects
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/blog"
                      className="footer__link"
                      {...buildUmamiEventAttributes('navigation', {destination: 'blog', method: 'route_link'})}
                    >
                      Blog
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/about"
                      className="footer__link"
                      {...buildUmamiEventAttributes('navigation', {destination: 'about', method: 'route_link'})}
                    >
                      About
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
            <div className="footer__group">
              <span className="footer__group-label">Connect</span>
              <nav aria-label="Social and contact links">
                <ul className="footer__links-list">
                  <li>
                    <a
                      href="https://github.com/marcusrbrown"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="footer__link"
                      {...buildUmamiEventAttributes('external_profile_open', {destination: 'github'})}
                    >
                      GitHub
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://twitter.com/mrbrodev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="footer__link"
                      {...buildUmamiEventAttributes('external_profile_open', {destination: 'twitter'})}
                    >
                      @mrbrodev
                    </a>
                  </li>
                  <li>
                    <a
                      href="mailto:hello@mrbro.dev"
                      className="footer__link"
                      {...buildUmamiEventAttributes('contact_open', {method: 'email'})}
                    >
                      hello@mrbro.dev
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
        <div className="footer__meta">
          <p className="footer__copyright">&copy; {currentYear} Marcus R. Brown.</p>
        </div>
      </div>
    </footer>
  )
}
