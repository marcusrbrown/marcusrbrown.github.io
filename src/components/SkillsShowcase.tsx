import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {useScrollAnimation} from '../hooks/UseScrollAnimation'
import {animateProficiency, createStaggeredDelays, getSafeAnimationDuration} from '../utils/animation-utils'

/** Animation duration for skill proficiency bar (ms) */
const SKILL_PROFICIENCY_ANIMATION_DURATION = 1200

// Animation timing configuration for skill proficiency bars
const SKILL_ANIMATION_BASE_DELAY = 150
const SKILL_ANIMATION_INCREMENT = 100

/**
 * Skill proficiency level (0-100)
 */
type ProficiencyLevel = number

/**
 * Individual skill definition
 */
export interface Skill {
  /** Unique identifier for the skill */
  id: string
  /** Display name of the skill */
  name: string
  /** Proficiency level from 0 to 100 */
  proficiency: ProficiencyLevel
  /** Icon identifier (could be class name or SVG identifier) */
  icon?: string
  /** Optional description or additional context */
  description?: string
}

/**
 * Skill category with associated skills
 */
export interface SkillCategory {
  /** Unique identifier for the category */
  id: string
  /** Display name of the category */
  name: string
  /** Icon for the category */
  icon: string
  /** List of skills in this category */
  skills: Skill[]
  /** Optional description of the category */
  description?: string
}

/**
 * Props for SkillItem component
 */
interface SkillItemProps {
  skill: Skill
  index: number
  isVisible: boolean
  onFocus?: (skillId: string) => void
  onBlur?: () => void
}

/**
 * Individual skill item with proficiency indicator and interactions
 */
const SkillItem: React.FC<SkillItemProps> = ({skill, index, isVisible, onFocus, onBlur}) => {
  const [animatedProficiency, setAnimatedProficiency] = useState(0)
  const [isAnimationComplete, setIsAnimationComplete] = useState(false)

  // Animate proficiency when skill becomes visible
  useEffect(() => {
    if (!isVisible || isAnimationComplete) return

    const delay = getSafeAnimationDuration(SKILL_ANIMATION_BASE_DELAY + index * SKILL_ANIMATION_INCREMENT)
    const duration = getSafeAnimationDuration(SKILL_PROFICIENCY_ANIMATION_DURATION)

    const cleanup = animateProficiency(
      skill.proficiency,
      value => {
        setAnimatedProficiency(value)
      },
      {
        delay,
        duration,
        easing: 'easeOutCubic',
      },
    )

    // For reduced motion, the animation completes immediately, so set a minimal timeout
    const completionTimeout = Math.max(delay + duration, 100)
    const timer = setTimeout(() => setIsAnimationComplete(true), completionTimeout)

    return () => {
      cleanup()
      clearTimeout(timer)
    }
  }, [isVisible, skill.proficiency, index, isAnimationComplete])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      // Could trigger additional interaction here (e.g., show details)
    }
  }, [])

  const handleFocus = useCallback(() => {
    onFocus?.(skill.id)
  }, [skill.id, onFocus])

  return (
    <div
      className={`skill-item ${isVisible ? 'skill-item--visible' : ''}`}
      tabIndex={0}
      role="listitem"
      aria-label={`${skill.name}: ${Math.round(animatedProficiency)}% proficiency`}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={onBlur}
      style={{'--skill-index': index} as React.CSSProperties}
    >
      <div className="skill-content">
        {skill.icon && (
          <div className="skill-icon" aria-hidden="true">
            <span className={`icon ${skill.icon}`} />
          </div>
        )}
        <div className="skill-info">
          <h4 className="skill-name">{skill.name}</h4>
          {skill.description && <p className="skill-description">{skill.description}</p>}
        </div>
        <div className="skill-proficiency">
          <div
            className="skill-proficiency-bar"
            role="progressbar"
            aria-valuenow={Math.round(animatedProficiency)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${skill.name} proficiency`}
          >
            <div className="skill-proficiency-fill" style={{width: `${animatedProficiency}%`}} />
          </div>
          <span className="skill-proficiency-text" aria-hidden="true">
            {Math.round(animatedProficiency)}%
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Props for SkillCategory component
 */
interface SkillCategoryProps {
  category: SkillCategory
  isVisible: boolean
  onSkillFocus?: (skillId: string) => void
  onSkillBlur?: () => void
}

/**
 * Skill category section with header and skill list
 */
const SkillCategorySection: React.FC<SkillCategoryProps> = ({category, isVisible, onSkillFocus, onSkillBlur}) => {
  return (
    <div className={`skill-category ${isVisible ? 'skill-category--visible' : ''}`}>
      <header className="skill-category-header">
        <div className="skill-category-icon" aria-hidden="true">
          <span className={`icon ${category.icon}`} />
        </div>
        <div className="skill-category-info">
          <h3 className="skill-category-title">{category.name}</h3>
          {category.description && <p className="skill-category-description">{category.description}</p>}
        </div>
      </header>
      <div className="skill-list" role="list">
        {category.skills.map((skill, index) => (
          <SkillItem
            key={skill.id}
            skill={skill}
            index={index}
            isVisible={isVisible}
            onFocus={onSkillFocus}
            onBlur={onSkillBlur}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Props for SkillsShowcase component
 */
export interface SkillsShowcaseProps {
  /** Custom class name */
  className?: string
  /** Custom title for the section */
  title?: string
  /** Custom subtitle/description */
  subtitle?: string
}

/**
 * Complete skills showcase with categories, proficiency indicators, and animations
 */
const SkillsShowcase: React.FC<SkillsShowcaseProps> = ({
  className = '',
  title = 'Skills & Expertise',
  subtitle = 'Technologies and tools I work with to build exceptional digital experiences',
}) => {
  const [focusedSkill, setFocusedSkill] = useState<string | null>(null)

  // Scroll animation for the entire skills section
  const {ref, isInView} = useScrollAnimation<HTMLElement>({
    threshold: 0.2,
    rootMargin: '0px 0px -100px 0px',
    triggerOnce: true,
  })

  // Define skill categories and data
  const skillCategories: SkillCategory[] = useMemo(
    () => [
      {
        id: 'frontend',
        name: 'Frontend Development',
        icon: 'icon-code',
        description: 'Building responsive and interactive user interfaces',
        skills: [
          {id: 'react', name: 'React', proficiency: 95, icon: 'icon-react'},
          {id: 'typescript', name: 'TypeScript', proficiency: 90, icon: 'icon-typescript'},
          {id: 'css', name: 'CSS/SCSS', proficiency: 88, icon: 'icon-css'},
          {id: 'html', name: 'HTML5', proficiency: 95, icon: 'icon-html'},
          {id: 'responsive', name: 'Responsive Design', proficiency: 92, icon: 'icon-mobile'},
        ],
      },
      {
        id: 'backend',
        name: 'Backend Development',
        icon: 'icon-server',
        description: 'Server-side development and API design',
        skills: [
          {id: 'nodejs', name: 'Node.js', proficiency: 85, icon: 'icon-nodejs'},
          {id: 'apis', name: 'REST APIs', proficiency: 90, icon: 'icon-api'},
          {id: 'database', name: 'Database Design', proficiency: 80, icon: 'icon-database'},
          {id: 'architecture', name: 'System Architecture', proficiency: 78, icon: 'icon-architecture'},
        ],
      },
      {
        id: 'tools',
        name: 'Development Tools',
        icon: 'icon-tools',
        description: 'Essential tools for modern development workflow',
        skills: [
          {id: 'git', name: 'Git', proficiency: 92, icon: 'icon-git'},
          {id: 'github-actions', name: 'GitHub Actions', proficiency: 85, icon: 'icon-github'},
          {id: 'vscode', name: 'VS Code', proficiency: 95, icon: 'icon-vscode'},
          {id: 'build-tools', name: 'Build Tools', proficiency: 88, icon: 'icon-build'},
          {id: 'testing', name: 'Testing Frameworks', proficiency: 85, icon: 'icon-test'},
        ],
      },
      {
        id: 'soft-skills',
        name: 'Professional Skills',
        icon: 'icon-people',
        description: 'Essential skills for effective collaboration and leadership',
        skills: [
          {id: 'problem-solving', name: 'Problem Solving', proficiency: 95, icon: 'icon-puzzle'},
          {id: 'communication', name: 'Communication', proficiency: 90, icon: 'icon-chat'},
          {id: 'mentoring', name: 'Mentoring', proficiency: 85, icon: 'icon-mentor'},
          {id: 'documentation', name: 'Documentation', proficiency: 88, icon: 'icon-doc'},
        ],
      },
    ],
    [],
  )

  // Calculate staggered delays for categories
  const categoryDelays = useMemo(
    () =>
      createStaggeredDelays(skillCategories.length, {
        baseDelay: 200,
        increment: 150,
      }),
    [skillCategories.length],
  )

  const handleSkillFocus = useCallback((skillId: string) => {
    setFocusedSkill(skillId)
  }, [])

  const handleSkillBlur = useCallback(() => {
    setFocusedSkill(null)
  }, [])

  return (
    <section ref={ref} className={`skills-showcase ${className}`.trim()} aria-labelledby="skills-title">
      <div className="container">
        <header className="section-header">
          <h2 id="skills-title" className="section-title">
            {title}
          </h2>
          <p className="section-subtitle">{subtitle}</p>
        </header>

        <div
          className={`skills-grid ${isInView ? 'skills-grid--visible' : ''}`}
          role="region"
          aria-label="Skills organized by category"
        >
          {skillCategories.map((category, index) => (
            <div
              key={category.id}
              className="skills-grid-item"
              style={
                {
                  '--category-delay': `${categoryDelays[index]}ms`,
                } as React.CSSProperties
              }
            >
              <SkillCategorySection
                category={category}
                isVisible={isInView}
                onSkillFocus={handleSkillFocus}
                onSkillBlur={handleSkillBlur}
              />
            </div>
          ))}
        </div>

        {focusedSkill && (
          <div className="skill-focus-indicator" aria-live="polite">
            Currently focused on:{' '}
            {skillCategories.flatMap(cat => cat.skills).find(skill => skill.id === focusedSkill)?.name}
          </div>
        )}
      </div>
    </section>
  )
}

export default SkillsShowcase
