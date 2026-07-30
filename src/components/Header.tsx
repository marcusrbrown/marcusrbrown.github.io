import React from 'react'
import {Link, NavLink} from 'react-router-dom'
import {ThemePicker} from './ThemePicker'

const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header__container">
        <h1 className="header__title">
          <Link to="/" className="header__title-link">
            mrbro.dev
          </Link>
        </h1>
        <nav className="header__nav" aria-label="Main navigation">
          <ul className="header__nav-list">
            <li className="header__nav-item">
              <NavLink to="/" className="header__nav-link" end>
                Home
              </NavLink>
            </li>
            <li className="header__nav-item">
              <NavLink to="/blog" className="header__nav-link">
                Blog
              </NavLink>
            </li>
            <li className="header__nav-item">
              <NavLink to="/projects" className="header__nav-link">
                Projects
              </NavLink>
            </li>
            <li className="header__nav-item">
              <NavLink to="/about" className="header__nav-link">
                About
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className="header__actions">
          <ThemePicker />
        </div>
      </div>
    </header>
  )
}

export default Header
