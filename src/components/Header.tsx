import React from 'react'
import {Link} from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header__container">
        <h1 className="header__title">
          <Link to="/" className="header__title-link">
            mrbro.dev
          </Link>
        </h1>
        <nav className="header__nav">
          <ul className="header__nav-list">
            <li className="header__nav-item">
              <Link to="/" className="header__nav-link">
                Home
              </Link>
            </li>
            <li className="header__nav-item">
              <Link to="/blog" className="header__nav-link">
                Blog
              </Link>
            </li>
            <li className="header__nav-item">
              <Link to="/projects" className="header__nav-link">
                Projects
              </Link>
            </li>
            <li className="header__nav-item">
              <Link to="/about" className="header__nav-link">
                About
              </Link>
            </li>
          </ul>
        </nav>
        <div className="header__actions">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

export default Header
