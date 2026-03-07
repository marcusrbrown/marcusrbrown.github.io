import React from 'react'
import {useScrollReveal} from '../../hooks/UseScrollReveal'

export const Experience: React.FC = () => {
  const {ref, isVisible} = useScrollReveal()

  return (
    <section ref={ref} id="experience" className={`brand-section fade-in-on-scroll ${isVisible ? 'is-visible' : ''}`}>
      <div className="container">
        <h2 className={`brand-section-title text-reveal ${isVisible ? 'is-visible' : ''}`}>Experience</h2>
        <div className="brand-experience-list">
          <article className="experience-item">
            <div className="experience-header">
              <h3>ComplyAuto</h3>
              <span className="experience-role">Senior Full Stack Developer (Current)</span>
            </div>
            <p>Compliance automation platform for automotive dealerships.</p>
          </article>

          <article className="experience-item">
            <div className="experience-header">
              <h3>Capillary North America</h3>
              <span className="experience-role">Principal Software Engineer</span>
            </div>
            <p>
              Architected telehealth scheduling system for HyVee during a period of 38× industry utilization growth.
              Developed DoorDash integration for last-mile delivery features.
            </p>
          </article>

          <article className="experience-item">
            <div className="experience-header">
              <h3>Carvana</h3>
              <span className="experience-role">Senior Software Engineer</span>
            </div>
            <p>
              Led development of mission-critical React.js web app connected to C# microservices orchestrated via
              Kubernetes on Azure + AWS.
            </p>
          </article>

          <article className="experience-item">
            <div className="experience-header">
              <h3>American Express</h3>
              <span className="experience-role">Senior Software Engineer</span>
            </div>
            <p>
              Built scalable micro-frontend architecture in React and Node.js; refactored 25+ legacy login pages into a
              standalone authentication application.
            </p>
          </article>

          <article className="experience-item">
            <div className="experience-header">
              <h3>Pravici</h3>
              <span className="experience-role">Blockchain Architect</span>
            </div>
            <p>
              Designed loyalty rewards platform for General Motors on Hyperledger Fabric + Ethereum tokens. Authored
              Solidity smart contracts.
            </p>
          </article>

          <article className="experience-item">
            <div className="experience-header">
              <h3>Rainbow Studios</h3>
              <span className="experience-role">Technical Director (AAA Gaming)</span>
            </div>
            <p>Shipped MX vs. ATV Supercross — ported to PS3, Xbox 360, PC, and PS4.</p>
          </article>
        </div>
      </div>
    </section>
  )
}
