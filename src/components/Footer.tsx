import React from 'react'

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="footer">
      <p>&copy; {currentYear} Marcus R. Brown. All rights reserved.</p>
      <nav>
        <a href="https://github.com/marcusrbrown" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <a href="https://twitter.com/mrbrodev" target="_blank" rel="noopener noreferrer">
          Twitter
        </a>
      </nav>
    </footer>
  )
}

export default Footer
