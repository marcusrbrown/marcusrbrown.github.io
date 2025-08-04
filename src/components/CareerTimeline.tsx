import React, {useState} from 'react'
import {useScrollAnimation} from '../hooks/UseScrollAnimation'

/**
 * Timeline item representing a career milestone
 */
interface TimelineItem {
  id: string
  date: string
  title: string
  company: string
  location?: string
  description: string
  technologies?: string[]
  achievements?: string[]
  type: 'work' | 'education' | 'project' | 'certification'
}

/**
 * Props for individual timeline item component
 */
interface TimelineItemProps {
  item: TimelineItem
  index: number
  isExpanded: boolean
  onToggle: (id: string) => void
}

/**
 * Individual timeline item component
 */
const TimelineItemComponent: React.FC<TimelineItemProps> = ({item, index, isExpanded, onToggle}) => {
  const {ref, animationState} = useScrollAnimation<HTMLLIElement>({
    threshold: 0.3,
    delay: index * 150,
    triggerOnce: true,
  })

  const handleToggle = () => {
    onToggle(item.id)
  }

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleToggle()
    }
  }

  return (
    <li ref={ref} className={`timeline-item timeline-item--${item.type} animate--${animationState}`}>
      <div className="timeline-marker" aria-hidden="true">
        <div className="timeline-marker-dot"></div>
      </div>

      <div className="timeline-content">
        <button
          className="timeline-header"
          onClick={handleToggle}
          onKeyDown={handleKeyPress}
          aria-expanded={isExpanded}
          aria-controls={`timeline-details-${item.id}`}
        >
          <div className="timeline-date">{item.date}</div>
          <h3 className="timeline-title">{item.title}</h3>
          <div className="timeline-company">
            {item.company}
            {item.location && <span className="timeline-location"> • {item.location}</span>}
          </div>
          <div className="timeline-expand-icon" aria-hidden="true">
            <svg
              className={`timeline-chevron ${isExpanded ? 'timeline-chevron--expanded' : ''}`}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>

        <div
          id={`timeline-details-${item.id}`}
          className={`timeline-details ${isExpanded ? 'timeline-details--expanded' : ''}`}
          aria-hidden={!isExpanded}
        >
          <p className="timeline-description">{item.description}</p>

          {item.achievements && item.achievements.length > 0 && (
            <div className="timeline-achievements">
              <h4 className="timeline-achievements-title">Key Achievements</h4>
              <ul className="timeline-achievements-list">
                {item.achievements.map((achievement, i) => (
                  <li key={i} className="timeline-achievement">
                    {achievement}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.technologies && item.technologies.length > 0 && (
            <div className="timeline-technologies">
              <h4 className="timeline-technologies-title">Technologies Used</h4>
              <div className="timeline-tech-tags">
                {item.technologies.map((tech, i) => (
                  <span key={i} className="timeline-tech-tag">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * Career timeline data
 */
const timelineData: TimelineItem[] = [
  {
    id: 'current-role',
    date: '2020 - Present',
    title: 'Senior Full-Stack Developer',
    company: 'Independent Consultant',
    location: 'Remote',
    type: 'work',
    description:
      'Leading full-stack development projects for diverse clients, specializing in modern web technologies and scalable architectures. Focus on React, TypeScript, Node.js, and cloud platforms.',
    achievements: [
      'Built and deployed 20+ modern web applications',
      'Improved client application performance by 60% on average',
      'Mentored 15+ junior developers across various projects',
      'Established CI/CD pipelines reducing deployment time by 80%',
    ],
    technologies: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS', 'Docker', 'GraphQL'],
  },
  {
    id: 'tech-lead',
    date: '2018 - 2020',
    title: 'Technical Lead',
    company: 'Tech Innovation Corp',
    location: 'San Francisco, CA',
    type: 'work',
    description:
      'Led a team of 8 developers in building enterprise-grade web applications. Responsible for architecture decisions, code reviews, and technical mentoring.',
    achievements: [
      'Successfully delivered 3 major product releases on time',
      'Reduced bug reports by 45% through improved testing practices',
      'Implemented agile development processes increasing team velocity by 30%',
      'Architected microservices infrastructure serving 100k+ users',
    ],
    technologies: ['React', 'Redux', 'Node.js', 'MongoDB', 'Express', 'Jest', 'Kubernetes'],
  },
  {
    id: 'senior-dev',
    date: '2016 - 2018',
    title: 'Senior Software Developer',
    company: 'Digital Solutions Inc',
    location: 'Austin, TX',
    type: 'work',
    description:
      'Developed complex web applications with focus on user experience and performance optimization. Collaborated with design and product teams to deliver exceptional digital experiences.',
    achievements: [
      'Optimized application load times by 70% through code splitting',
      'Implemented responsive design supporting 5+ device categories',
      'Contributed to open-source projects gaining 500+ GitHub stars',
      'Led migration from legacy jQuery to modern React architecture',
    ],
    technologies: ['JavaScript', 'React', 'Sass', 'Webpack', 'PHP', 'MySQL', 'Redis'],
  },
  {
    id: 'education',
    date: '2012 - 2016',
    title: 'Bachelor of Science in Computer Science',
    company: 'University of Technology',
    location: 'Austin, TX',
    type: 'education',
    description:
      'Comprehensive computer science education with focus on software engineering, algorithms, and system design.',
    achievements: [
      'Graduated Magna Cum Laude with 3.8 GPA',
      'President of Computer Science Student Association',
      'Winner of Annual Hackathon Competition (2015)',
      'Published research paper on web performance optimization',
    ],
    technologies: ['Java', 'C++', 'Python', 'SQL', 'Data Structures', 'Algorithms'],
  },
]

/**
 * Career timeline component with expandable items
 */
const CareerTimeline: React.FC = () => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const {ref, animationState} = useScrollAnimation<HTMLDivElement>({
    threshold: 0.2,
    triggerOnce: true,
  })

  const handleToggleItem = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  return (
    <div
      ref={ref}
      className={`career-timeline animate--${animationState}`}
      role="region"
      aria-label="Professional career timeline"
    >
      <ol className="timeline-list" role="list">
        {timelineData.map((item, index) => (
          <TimelineItemComponent
            key={item.id}
            item={item}
            index={index}
            isExpanded={expandedItems.has(item.id)}
            onToggle={handleToggleItem}
          />
        ))}
      </ol>
    </div>
  )
}

export default CareerTimeline
