/**
 * Test data fixtures for consistent test scenarios
 * Provides reusable test data for E2E tests
 */

export const testData = {
  // Viewport configurations for responsive testing
  viewports: {
    mobile: {
      small: {width: 375, height: 667, name: 'Mobile Small'},
      large: {width: 414, height: 896, name: 'Mobile Large'},
    },
    tablet: {
      portrait: {width: 768, height: 1024, name: 'Tablet Portrait'},
      landscape: {width: 1024, height: 768, name: 'Tablet Landscape'},
    },
    desktop: {
      small: {width: 1024, height: 768, name: 'Desktop Small'},
      medium: {width: 1440, height: 900, name: 'Desktop Medium'},
      large: {width: 1920, height: 1080, name: 'Desktop Large'},
    },
  },

  // Theme configurations
  themes: {
    modes: ['light', 'dark', 'system'] as const,
    validModes: (mode: string): mode is 'light' | 'dark' | 'system' => {
      return ['light', 'dark', 'system'].includes(mode)
    },
  },

  // Navigation routes
  routes: {
    home: '/',
    about: '/about',
    projects: '/projects',
    blog: '/blog',
  },

  // Page selectors commonly used across tests
  selectors: {
    header: 'header',
    footer: 'footer',
    main: 'main',
    nav: 'nav',
    themeToggle: '[data-testid="theme-toggle"]',
    mobileMenu: '[data-testid="mobile-menu"], .mobile-menu-button, .hamburger',

    // Home page specific
    heroSection: '[data-testid="hero-section"]',
    skillsShowcase: '[data-testid="skills-showcase"]',
    featuredProjects: '[data-testid="featured-projects"]',

    // Content selectors
    projectCard: '[data-testid="project-card"], .project-card',
    blogPost: '[data-testid="blog-post"], .blog-post',
    profileImage: '[data-testid="profile-image"], img[alt*="profile"]',
  },

  // Test timeouts and delays
  timeouts: {
    short: 100,
    medium: 500,
    long: 1000,
    themeTransition: 300,
    pageLoad: 5000,
  },

  // Accessibility requirements
  accessibility: {
    minTouchTarget: 44, // 44x44px minimum touch target size
    minFontSize: 14, // Minimum font size for readability
    maxLineHeight: 3, // Maximum line height
    minLineHeight: 1, // Minimum line height
  },

  // Sample text content for validation
  sampleContent: {
    heroTitles: ['Marcus R. Brown', 'Welcome', 'Developer', 'Portfolio'],
    navLinks: ['Home', 'About', 'Projects', 'Blog'],
    skillCategories: ['Frontend', 'Backend', 'DevOps', 'Languages', 'Frameworks', 'Tools'],
  },

  // Test scenarios for complex workflows
  scenarios: {
    themeToggling: {
      sequence: ['light', 'dark', 'system'] as const,
      description: 'Standard theme toggle sequence',
    },
    crossPageNavigation: {
      sequence: ['home', 'about', 'projects', 'blog', 'home'] as const,
      description: 'Complete navigation flow',
    },
    responsiveBreakpoints: [
      {width: 375, height: 667, category: 'mobile'},
      {width: 768, height: 1024, category: 'tablet'},
      {width: 1024, height: 768, category: 'desktop'},
      {width: 1440, height: 900, category: 'desktop'},
    ],
  },

  // Error states and edge cases
  edgeCases: {
    emptyStates: {
      noBlogPosts: 'No blog posts available',
      noProjects: 'No projects to display',
      noSkills: 'Skills not loaded',
    },
    errorMessages: {
      pageNotFound: '404',
      loadError: 'Failed to load',
      networkError: 'Network error',
    },
  },

  // Performance expectations
  performance: {
    maxLoadTime: 5000, // 5 seconds maximum load time
    maxThemeTransition: 500, // Maximum theme transition time
    maxImageLoad: 3000, // Maximum image load time
  },

  // GitHub API related test data (for projects/blog features)
  github: {
    mockRepository: {
      name: 'test-repo',
      description: 'Test repository for E2E testing',
      language: 'TypeScript',
      stars: 42,
      topics: ['react', 'typescript', 'testing'],
    },
    mockBlogPost: {
      title: 'Test Blog Post',
      body: 'This is a test blog post content',
      labels: [{name: 'blog', color: 'blue'}],
      number: 1,
    },
  },
} as const

/**
 * Type definitions for test data
 */
export type ViewportSize = {
  width: number
  height: number
  name?: string
}

export type ThemeMode = (typeof testData.themes.modes)[number]

export type RouteKey = keyof typeof testData.routes

export type TestScenario = {
  sequence: readonly string[]
  description: string
}
