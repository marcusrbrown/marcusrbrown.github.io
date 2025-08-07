import React from 'react'
import CodeBlock from '../components/CodeBlock'
import {usePageTitle} from '../hooks/UsePageTitle'

const About: React.FC = () => {
  usePageTitle('About')

  const exampleCode = `// Example TypeScript code with syntax highlighting
interface Developer {
  name: string
  skills: string[]
  passion: 'open-source' | 'privacy' | 'security'
}

const marcus: Developer = {
  name: 'Marcus R. Brown',
  skills: ['TypeScript', 'React', 'AI', 'Game Development'],
  passion: 'open-source'
}

const getIntroduction = (dev: Developer): string => {
  return \`Hello! I'm \${dev.name}, passionate about \${dev.passion}.\`
}

console.log(getIntroduction(marcus))`

  return (
    <div>
      <h1>About Me</h1>
      <p>
        Hello! I'm Marcus R. Brown, a developer focused on open source, privacy, and security. I have a passion for AI,
        game development, embedded systems, and home automation.
      </p>
      <p>This portfolio showcases my projects and blog posts, reflecting my journey and interests in technology.</p>

      <h2>Theme-Aware Code Highlighting</h2>
      <p>This site features intelligent syntax highlighting that adapts to your theme preference:</p>

      <CodeBlock language="typescript" title="Developer Profile Example" showLineNumbers={true}>
        {exampleCode}
      </CodeBlock>

      <p>
        The code highlighting automatically switches between light and dark themes, ensuring optimal readability in any
        mode!
      </p>
      <p>Feel free to explore my work and connect with me on GitHub!</p>
    </div>
  )
}

export default About
