import React from 'react'
import Navigation from './components/Navigation'
import About from './components/sections/About'
import Contact from './components/sections/Contact'
import Experience from './components/sections/Experience'
import Skills from './components/sections/Skills'

const App: React.FC = () => {
  return (
    <>
      <Navigation />
      <main>
        <About />
        <Experience />
        <Skills />
        <Contact />
      </main>
    </>
  )
}

export default App
