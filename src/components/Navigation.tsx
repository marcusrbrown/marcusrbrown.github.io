import React from 'react'
import '../styles/Navigation.css'

const Navigation: React.FC = () => {
  return (
    <nav className="brand-navigation">
      <div className="container nav-container">
        <a href="#about" className="nav-brand subtle-hover-lift">
          MRB
        </a>
        <ul className="nav-links">
          <li>
            <a href="#about" className="subtle-hover-lift">
              About
            </a>
          </li>
          <li>
            <a href="#experience" className="subtle-hover-lift">
              Experience
            </a>
          </li>
          <li>
            <a href="#skills" className="subtle-hover-lift">
              Skills
            </a>
          </li>
          <li>
            <a href="#contact" className="subtle-hover-lift">
              Contact
            </a>
          </li>
        </ul>
      </div>
    </nav>
  )
}

export default Navigation
