import React from 'react'
import {Route, BrowserRouter as Router, Routes} from 'react-router-dom'
import Footer from './components/Footer'
import Header from './components/Header'
import {ThemeProvider} from './contexts/ThemeContext'
import About from './pages/About'
import Blog from './pages/Blog'
import Home from './pages/Home'
import Projects from './pages/Projects'
import './styles/globals.css'

const App: React.FC = () => {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  )
}

export default App
