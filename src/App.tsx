import React from 'react'
import {Route, BrowserRouter as Router, Routes} from 'react-router-dom'
import Footer from './components/Footer'
import Header from './components/Header'
import {ThemeProvider} from './contexts/ThemeContext'
import {useSyntaxHighlighting} from './hooks/UseSyntaxHighlighting'
import About from './pages/About'
import Blog from './pages/Blog'
import Home from './pages/Home'
import Projects from './pages/Projects'
import './styles/globals.css'

const AppContent: React.FC = () => {
  // Initialize syntax highlighting integration with theme system
  useSyntaxHighlighting()

  return (
    <Router>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
      <Footer />
    </Router>
  )
}

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
