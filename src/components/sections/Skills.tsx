import React from 'react'
import {useScrollReveal} from '../../hooks/UseScrollReveal'

export const Skills: React.FC = () => {
  const {ref, isVisible} = useScrollReveal()

  return (
    <section ref={ref} id="skills" className={`brand-section fade-in-on-scroll ${isVisible ? 'is-visible' : ''}`}>
      <div className="container">
        <h2 className={`brand-section-title text-reveal ${isVisible ? 'is-visible' : ''}`}>Skills</h2>
        <div className="brand-skills-grid">
          <div className="skills-category">
            <h3>Languages</h3>
            <ul>
              <li>TypeScript, JavaScript</li>
              <li>Python, C#</li>
              <li>Swift, Solidity, SQL</li>
            </ul>
          </div>
          <div className="skills-category">
            <h3>Frameworks & Platforms</h3>
            <ul>
              <li>React, Next.js, Node.js</li>
              <li>Redux, ASP.NET MVC</li>
              <li>Flask, .NET Framework</li>
            </ul>
          </div>
          <div className="skills-category">
            <h3>Blockchain</h3>
            <ul>
              <li>Hyperledger Fabric, Ethereum</li>
              <li>Solidity, ERC20, Chainpoint</li>
              <li>BTC / ETH</li>
            </ul>
          </div>
          <div className="skills-category">
            <h3>Cloud & DevOps</h3>
            <ul>
              <li>AWS, GCP, Azure</li>
              <li>Docker, Kubernetes</li>
              <li>Docker Swarm</li>
            </ul>
          </div>
          <div className="skills-category">
            <h3>Domains</h3>
            <ul>
              <li>Gaming, Enterprise</li>
              <li>Blockchain, AI</li>
              <li>FinTech, Interactive</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
