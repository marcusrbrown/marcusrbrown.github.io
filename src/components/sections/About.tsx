import React from 'react'
import {useScrollReveal} from '../../hooks/UseScrollReveal'

const About: React.FC = () => {
  const {ref, isVisible} = useScrollReveal()

  return (
    <section ref={ref} id="about" className={`brand-section fade-in-on-scroll ${isVisible ? 'is-visible' : ''}`}>
      <div className="container">
        <h2 className={`brand-section-title text-reveal ${isVisible ? 'is-visible' : ''}`}>About</h2>
        <div className="brand-section-content">
          <p>
            Versatile Full Stack Developer and Principal Software Engineer with 20+ years of experience building
            distributed systems across gaming, enterprise, and blockchain. Expert in system architecture and performance
            optimization, with a focus on delivering high-quality, scalable solutions.
          </p>
          <div className="about-details">
            <div className="about-interests">
              <h3>Interests</h3>
              <ul>
                <li>Artificial Intelligence</li>
                <li>Blockchain Technology</li>
                <li>Game Development</li>
                <li>Embedded Systems</li>
                <li>Home Automation</li>
              </ul>
            </div>
            <div className="about-location">
              <h3>Location</h3>
              <p>Greater Phoenix Area, AZ</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default About
