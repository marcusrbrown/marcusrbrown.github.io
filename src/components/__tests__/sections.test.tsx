import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {About} from '../sections/About'
import {Contact} from '../sections/Contact'
import {Experience} from '../sections/Experience'
import {Skills} from '../sections/Skills'

vi.mock('../../hooks/UseScrollReveal', () => ({
  useScrollReveal: () => ({
    ref: {current: null},
    isVisible: true,
  }),
}))

describe('section components smoke tests', () => {
  it('renders About section with expected id and title', () => {
    render(<About />)

    expect(document.querySelector('#about')).not.toBeNull()
    expect(screen.getByRole('heading', {level: 2, name: 'About'})).toBeDefined()
  })

  it('renders Experience section with expected id and title', () => {
    render(<Experience />)

    expect(document.querySelector('#experience')).not.toBeNull()
    expect(screen.getByRole('heading', {level: 2, name: 'Experience'})).toBeDefined()
  })

  it('renders Skills section with expected id and title', () => {
    render(<Skills />)

    expect(document.querySelector('#skills')).not.toBeNull()
    expect(screen.getByRole('heading', {level: 2, name: 'Skills'})).toBeDefined()
  })

  it('renders Contact section with expected id and title', () => {
    render(<Contact />)

    expect(document.querySelector('#contact')).not.toBeNull()
    expect(screen.getByRole('heading', {level: 2, name: 'Contact'})).toBeDefined()
  })
})
