---
goal: Build a sophisticated dark/light theme system with system preference detection, smooth transitions, and theme persistence
version: 1.0
date_created: 2025-07-28
last_updated: 2025-07-29
owner: Marcus R. Brown
status: 'In Progress'
tags: feature,theme,accessibility,ui,user-experience
---

# Introduction

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-orange)

This implementation plan outlines the development of a comprehensive dark/light theme system for the mrbro.dev portfolio website. The system will include automatic system preference detection, smooth transitions, persistent theme storage, themed components with CSS custom properties, theme-aware syntax highlighting for code blocks, and a customizable theme editor that allows users to create custom color schemes. The implementation prioritizes accessibility, performance, and user experience with proper reduced motion support.

## 1. Requirements & Constraints

- **REQ-001**: System must detect and respect user's OS theme preference (prefers-color-scheme)
- **REQ-002**: Theme selection must persist across browser sessions using localStorage
- **REQ-003**: All theme transitions must be smooth and performant (< 300ms)
- **REQ-004**: Theme system must support minimum 2 built-in themes (light, dark)
- **REQ-005**: Custom theme creator must allow HSL color customization
- **REQ-006**: Code syntax highlighting must adapt to current theme
- **REQ-007**: Theme toggle must be accessible via keyboard navigation
- **SEC-001**: localStorage usage must handle quota exceeded scenarios gracefully
- **SEC-002**: All theme data must be validated before application
- **ACC-001**: Must respect prefers-reduced-motion for transition animations
- **ACC-002**: Theme toggle must have proper ARIA labels and roles
- **ACC-003**: Color contrast ratios must meet WCAG 2.1 AA standards (4.5:1 for normal text)
- **CON-001**: Must maintain existing React 18+ and TypeScript strict mode compatibility
- **CON-002**: No external CSS framework dependencies (maintain current vanilla CSS approach)
- **CON-003**: Must work with existing Vite build system and ESM module structure
- **GUD-001**: Follow existing code patterns and file naming conventions
- **GUD-002**: Maintain 80%+ test coverage for new theme functionality
- **PAT-001**: Use React Context pattern for theme state management
- **PAT-002**: Implement CSS custom properties for theme variables
- **PAT-003**: Follow compound component pattern for theme customizer

## 2. Implementation Steps

### Implementation Phase 1: Core Theme Infrastructure

- **GOAL-001**: Establish foundational theme system with context, hooks, and CSS custom properties

| Task | Description | Completed | Date |
| --- | --- | --- | --- |
| TASK-001 | Create theme context and provider in `src/contexts/ThemeContext.tsx` with TypeScript interfaces | ✅ | 2025-07-28 |
| TASK-002 | Implement `useTheme` hook in `src/hooks/UseTheme.ts` with system preference detection | ✅ | 2025-07-29 |
| TASK-003 | Create theme storage utilities in `src/utils/theme-storage.ts` with localStorage integration | ✅ | 2025-07-29 |
| TASK-004 | Define CSS custom properties for color system in `src/styles/themes.css` | ✅ | 2025-07-29 |
| TASK-005 | Create theme type definitions in `src/types/theme.ts` with strict TypeScript interfaces | ✅ | 2025-07-29 |
| TASK-006 | Add theme provider to App.tsx and establish global theme context | ✅ | 2025-07-29 |

### Implementation Phase 2: Theme-aware Components and Styling

- **GOAL-002**: Transform existing components to use theme-aware styling and create theme toggle UI

| Task | Description | Completed | Date |
| --- | --- | --- | --- |
| TASK-007 | Create ThemeToggle component in `src/components/ThemeToggle.tsx` with accessibility features | ✅ | 2025-07-29 |
| TASK-008 | Update Header component to include theme toggle with proper positioning | ✅ | 2025-07-29 |
| TASK-009 | Refactor globals.css to use CSS custom properties for all color values | ✅ | 2025-07-29 |
| TASK-010 | Update ProjectCard component styling to use theme-aware CSS custom properties | ✅ | 2025-07-29 |
| TASK-011 | Update BlogPost component styling to use theme-aware CSS custom properties |  |  |
| TASK-012 | Create theme-aware button and form component styles |  |  |

### Implementation Phase 3: System Integration and Persistence

- **GOAL-003**: Implement complete theme persistence, system preference detection, and smooth transitions

| Task     | Description                                                                         | Completed | Date |
| -------- | ----------------------------------------------------------------------------------- | --------- | ---- |
| TASK-013 | Implement system preference detection using prefers-color-scheme media query        |           |      |
| TASK-014 | Add localStorage persistence with error handling and fallback mechanisms            |           |      |
| TASK-015 | Create smooth CSS transitions for theme changes with prefers-reduced-motion support |           |      |
| TASK-016 | Implement theme initialization on app startup with system preference detection      |           |      |
| TASK-017 | Add theme persistence across browser sessions and tabs                              |           |      |
| TASK-018 | Create theme validation and sanitization utilities                                  |           |      |

### Implementation Phase 4: Advanced Features

- **GOAL-004**: Implement theme customizer and syntax highlighting integration

| Task | Description | Completed | Date |
| --- | --- | --- | --- |
| TASK-019 | Create ThemeCustomizer component in `src/components/ThemeCustomizer.tsx` with HSL controls |  |  |
| TASK-020 | Implement custom theme creation and export functionality |  |  |
| TASK-021 | Add syntax highlighting theme integration for code blocks using Prism.js or highlight.js |  |  |
| TASK-022 | Create theme preview functionality in customizer with real-time updates |  |  |
| TASK-023 | Implement theme import/export functionality with JSON schema validation |  |  |
| TASK-024 | Add preset theme gallery with popular color schemes |  |  |

### Implementation Phase 5: Accessibility and Performance

- **GOAL-005**: Ensure accessibility compliance and optimize performance

| Task     | Description                                                                | Completed | Date |
| -------- | -------------------------------------------------------------------------- | --------- | ---- |
| TASK-025 | Implement WCAG 2.1 AA color contrast validation for custom themes          |           |      |
| TASK-026 | Add keyboard navigation support for all theme-related UI components        |           |      |
| TASK-027 | Optimize theme switching performance using CSS containment and will-change |           |      |
| TASK-028 | Add reduced motion preferences handling for all theme animations           |           |      |
| TASK-029 | Implement theme preloading to prevent flash of unstyled content (FOUC)     |           |      |
| TASK-030 | Add comprehensive test suite for theme functionality with 80%+ coverage    |           |      |

## 3. Alternatives

- **ALT-001**: Use CSS-in-JS library (styled-components/emotion) - Rejected due to bundle size concerns and preference for vanilla CSS approach
- **ALT-002**: Implement themes using CSS classes instead of custom properties - Rejected due to less flexibility for custom themes
- **ALT-003**: Use browser's built-in color scheme detection only - Rejected due to requirement for custom theme creation
- **ALT-004**: Store themes in cookies instead of localStorage - Rejected due to size limitations and GDPR implications
- **ALT-005**: Use external theme management library - Rejected to maintain control and minimize dependencies

## 4. Dependencies

- **DEP-001**: Prism.js or highlight.js for syntax highlighting theme integration (development dependency)
- **DEP-002**: Color manipulation utilities (can be implemented natively with HSL)
- **DEP-003**: WCAG color contrast validation library or native implementation
- **DEP-004**: React 18+ Context API (already available)
- **DEP-005**: Modern browser support for CSS custom properties and prefers-color-scheme

## 5. Files

- **FILE-001**: `src/contexts/ThemeContext.tsx` - Main theme context provider with state management
- **FILE-002**: `src/hooks/UseTheme.ts` - Custom hook for theme operations and system preference detection
- **FILE-003**: `src/utils/themeStorage.ts` - LocalStorage utilities with error handling
- **FILE-004**: `src/types/theme.ts` - TypeScript interfaces for theme system
- **FILE-005**: `src/styles/themes.css` - CSS custom properties for all theme variables
- **FILE-006**: `src/components/ThemeToggle.tsx` - Accessible theme toggle button component
- **FILE-007**: `src/components/ThemeCustomizer.tsx` - Advanced theme creation interface
- **FILE-008**: `src/styles/globals.css` - Updated to use CSS custom properties (existing file)
- **FILE-009**: `src/App.tsx` - Updated to include ThemeProvider (existing file)
- **FILE-010**: All component files in `src/components/` - Updated for theme-aware styling

## 6. Testing

- **TEST-001**: Unit tests for ThemeContext provider state management and actions
- **TEST-002**: Unit tests for useTheme hook including system preference detection
- **TEST-003**: Unit tests for theme storage utilities with localStorage mocking
- **TEST-004**: Integration tests for theme persistence across app remounts
- **TEST-005**: Accessibility tests for theme toggle and customizer keyboard navigation
- **TEST-006**: Visual regression tests for theme switching animations
- **TEST-007**: Performance tests for theme switching speed and memory usage
- **TEST-008**: Color contrast validation tests for built-in and custom themes
- **TEST-009**: E2E tests for complete theme creation and customization workflow
- **TEST-010**: Cross-browser compatibility tests for CSS custom properties

## 7. Risks & Assumptions

- **RISK-001**: Browser localStorage quota exceeded - Mitigated by compression and cleanup strategies
- **RISK-002**: CSS custom properties not supported in target browsers - Mitigated by graceful fallbacks
- **RISK-003**: Performance impact of frequent theme switches - Mitigated by debouncing and CSS optimizations
- **RISK-004**: Color contrast validation complexity - Mitigated by using established WCAG algorithms
- **ASSUMPTION-001**: Users will primarily use built-in themes rather than extensive customization
- **ASSUMPTION-002**: System preference detection is available in target browsers (95%+ support)
- **ASSUMPTION-003**: LocalStorage is available and not disabled by user or enterprise policies
- **ASSUMPTION-004**: CSS transitions are acceptable for theme switching UX
- **ASSUMPTION-005**: Current CSS architecture can be refactored without breaking existing functionality

## 8. Related Specifications / Further Reading

- [CSS Custom Properties Specification](https://www.w3.org/TR/css-variables-1/)
- [prefers-color-scheme Media Query](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)
- [WCAG 2.1 Color Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [React Context API Documentation](https://react.dev/reference/react/createContext)
- [Web Storage API Specification](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [prefers-reduced-motion Media Query](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
