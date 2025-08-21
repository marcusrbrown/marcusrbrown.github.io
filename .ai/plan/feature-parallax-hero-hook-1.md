---
goal: Create UseParallaxHero.ts hook and compound ParallaxHero component with performant parallax scrolling, accessibility support, and comprehensive visual testing
version: 1.0
date_created: 2025-08-08
last_updated: 2025-08-08
owner: Marcus R. Brown (marcusrbrown)
status: 'Planned'
tags: [feature, hook, parallax, accessibility, visual-testing, compound-component]
---

# Create UseParallaxHero.ts Hook and ParallaxHero Component Implementation Plan

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Create a new `UseParallaxHero.ts` hook following the established `UseScrollAnimation.ts` pattern that implements performant parallax scrolling for hero sections. The implementation includes a compound component architecture, accessibility support with `prefers-reduced-motion` respect, theme system integration via CSS custom properties, and comprehensive visual regression testing across all theme presets.

## 1. Requirements & Constraints

**Core Requirements:**
- **REQ-001**: Create UseParallaxHero.ts hook following UseScrollAnimation.ts patterns and TypeScript strict mode
- **REQ-002**: Implement compound ParallaxHero component with sub-components (ParallaxHero.Background, ParallaxHero.Content, ParallaxHero.Layer)
- **REQ-003**: Ensure performant parallax scrolling using transform3d and will-change CSS properties
- **REQ-004**: Integrate with existing theme system using CSS custom properties (--color-primary, --color-surface, etc.)
- **REQ-005**: Support multiple parallax layers with configurable scroll speeds and directions

**Security & Accessibility:**
- **SEC-001**: Respect `prefers-reduced-motion` media query and disable parallax effects when reduced motion is preferred
- **SEC-002**: Ensure proper ARIA labels and semantic HTML structure for screen readers
- **SEC-003**: Implement proper focus management and keyboard navigation support

**Performance Requirements:**
- **PER-001**: Use Intersection Observer API for efficient scroll tracking
- **PER-002**: Implement RAF (requestAnimationFrame) throttling for smooth 60fps animations
- **PER-003**: Minimize DOM manipulations and use transform3d for GPU acceleration
- **PER-004**: Ensure bundle size impact remains under 2KB gzipped

**Constraints:**
- **CON-001**: Must maintain compatibility with existing UseScrollAnimation.ts hook architecture
- **CON-002**: Visual regression tests must pass across all 10+ theme presets
- **CON-003**: Component must work in SSR environments with proper hydration
- **CON-004**: Must maintain current performance budgets (JavaScript <500KB warning threshold)

**Guidelines:**
- **GUD-001**: Follow established hook patterns with PascalCase naming (UseParallaxHero.ts)
- **GUD-002**: Use compound component patterns similar to SkillsShowcase architecture
- **GUD-003**: Implement comprehensive JSDoc documentation with examples
- **GUD-004**: Support theme-aware styling through CSS custom properties

**Patterns:**
- **PAT-001**: Use React 19+ concurrent features and modern hook patterns
- **PAT-002**: Implement TypeScript strict interfaces with proper generics
- **PAT-003**: Follow existing visual testing patterns with cross-theme validation
- **PAT-004**: Use CSS-in-JS approach with theme integration similar to BackgroundPattern.tsx

## 2. Implementation Steps

### Implementation Phase 1: Core Hook Development

- GOAL-001: Create performant UseParallaxHero.ts hook with accessibility and theme integration

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Create `src/hooks/UseParallaxHero.ts` with TypeScript interfaces and core parallax logic | |  |
| TASK-002 | Implement Intersection Observer integration with configurable thresholds and root margins | |  |
| TASK-003 | Add requestAnimationFrame throttling for smooth 60fps scroll animations | |  |
| TASK-004 | Integrate `prefersReducedMotion()` utility with fallback behavior for accessibility | |  |
| TASK-005 | Create utility functions for parallax calculations (getParallaxTransform, calculateLayerOffset) | |  |
| TASK-006 | Add comprehensive JSDoc documentation with usage examples and API reference | |  |

### Implementation Phase 2: Compound Component Architecture

- GOAL-002: Build compound ParallaxHero component following established patterns

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-007 | Create `src/components/ParallaxHero/index.tsx` with main ParallaxHero component | |  |
| TASK-008 | Implement `src/components/ParallaxHero/ParallaxBackground.tsx` for background layer management | |  |
| TASK-009 | Create `src/components/ParallaxHero/ParallaxContent.tsx` for foreground content with proper semantics | |  |
| TASK-010 | Build `src/components/ParallaxHero/ParallaxLayer.tsx` for configurable parallax layers | |  |
| TASK-011 | Add compound component exports and TypeScript interface definitions | |  |
| TASK-012 | Implement theme-aware CSS custom properties integration (--parallax-*, --hero-*) | |  |

### Implementation Phase 3: Theme System Integration

- GOAL-003: Integrate with existing theme system and CSS custom properties

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-013 | Create `src/styles/parallax-hero.css` with theme-aware CSS custom properties | |  |
| TASK-014 | Implement dynamic CSS property updates based on current theme state | |  |
| TASK-015 | Add support for all 10+ theme presets (GitHub, Material, Nord, Solarized, etc.) | |  |
| TASK-016 | Create theme-specific parallax effect variations and color schemes | |  |
| TASK-017 | Test theme switching transitions and ensure smooth visual updates | |  |

### Implementation Phase 4: Visual Testing Infrastructure

- GOAL-004: Comprehensive visual regression testing across all theme presets

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-018 | Create `tests/visual/parallax-hero.spec.ts` with theme-based screenshot testing | |  |
| TASK-019 | Add visual tests for all 10+ theme presets with different viewport sizes | |  |
| TASK-020 | Implement reduced motion testing scenarios with visual validation | |  |
| TASK-021 | Create responsive breakpoint tests (375px, 768px, 1440px) for all themes | |  |
| TASK-022 | Add performance regression testing for parallax smooth scrolling | |  |
| TASK-023 | Update visual test baselines and integrate with CI/CD pipeline | |  |

### Implementation Phase 5: Unit Testing & Documentation

- GOAL-005: Complete testing coverage and comprehensive documentation

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-024 | Create `tests/hooks/UseParallaxHero.test.ts` with comprehensive unit tests | |  |
| TASK-025 | Add component integration tests for `tests/components/ParallaxHero.test.tsx` | |  |
| TASK-026 | Implement accessibility testing with keyboard navigation and screen reader support | |  |
| TASK-027 | Create usage examples in `examples/use-parallax-hero-example.tsx` | |  |
| TASK-028 | Update README.md with ParallaxHero component documentation and examples | |  |
| TASK-029 | Add performance monitoring integration with build analysis scripts | |  |

## 3. Alternatives

**Alternative Approaches Considered:**

- **ALT-001**: Use third-party parallax library (react-parallax) - Rejected due to bundle size concerns and lack of theme integration
- **ALT-002**: CSS-only parallax with transform3d and scroll-behavior - Rejected due to limited control and accessibility challenges
- **ALT-003**: Framer Motion parallax implementation - Rejected due to existing animation architecture and bundle size impact
- **ALT-004**: Intersection Observer with throttled scroll listeners - Rejected due to performance concerns on mobile devices
- **ALT-005**: Web Animations API approach - Rejected due to browser compatibility requirements and complexity

## 4. Dependencies

**Internal Dependencies:**
- **DEP-001**: `src/hooks/UseScrollAnimation.ts` - Reference implementation for hook patterns and utilities
- **DEP-002**: `src/utils/accessibility.ts` - `prefersReducedMotion()` utility and accessibility helpers
- **DEP-003**: `src/contexts/ThemeContext.tsx` - Theme state management and CSS custom properties
- **DEP-004**: `src/types/index.ts` - Shared TypeScript interfaces and theme types

**External Dependencies:**
- **DEP-005**: React 19+ - Modern concurrent features and hook patterns
- **DEP-006**: TypeScript 5+ - Strict mode compliance and advanced type features
- **DEP-007**: Playwright - Visual regression testing infrastructure
- **DEP-008**: Vite 7+ - Build optimization and CSS custom properties support

## 5. Files

**New Files to Create:**
- **FILE-001**: `src/hooks/UseParallaxHero.ts` - Main parallax hook with TypeScript interfaces
- **FILE-002**: `src/components/ParallaxHero/index.tsx` - Main compound component with exports
- **FILE-003**: `src/components/ParallaxHero/ParallaxBackground.tsx` - Background layer component
- **FILE-004**: `src/components/ParallaxHero/ParallaxContent.tsx` - Content layer component with semantics
- **FILE-005**: `src/components/ParallaxHero/ParallaxLayer.tsx` - Configurable parallax layer component
- **FILE-006**: `src/styles/parallax-hero.css` - Theme-aware CSS with custom properties
- **FILE-007**: `tests/hooks/UseParallaxHero.test.ts` - Hook unit tests
- **FILE-008**: `tests/components/ParallaxHero.test.tsx` - Component integration tests
- **FILE-009**: `tests/visual/parallax-hero.spec.ts` - Visual regression tests
- **FILE-010**: `examples/use-parallax-hero-example.tsx` - Usage examples and documentation

**Files to Modify:**
- **FILE-011**: `src/components/HeroSection.tsx` - Integration with new ParallaxHero component
- **FILE-012**: `src/pages/Home.tsx` - Update hero section implementation
- **FILE-013**: `tests/visual/components.spec.ts` - Add ParallaxHero visual test integration
- **FILE-014**: `playwright.config.ts` - Update visual test configuration if needed
- **FILE-015**: `README.md` - Add ParallaxHero documentation and examples

## 6. Testing

**Unit Testing:**
- **TEST-001**: Hook functionality testing with mocked Intersection Observer and RAF
- **TEST-002**: Parallax calculation accuracy testing with various scroll positions
- **TEST-003**: Reduced motion preference testing with proper fallback behavior
- **TEST-004**: Theme integration testing with CSS custom property updates
- **TEST-005**: Performance testing with RAF throttling and GPU acceleration validation

**Integration Testing:**
- **TEST-006**: Component rendering tests with different parallax configurations
- **TEST-007**: Theme switching tests with visual transition validation
- **TEST-008**: Accessibility testing with keyboard navigation and screen reader support
- **TEST-009**: Responsive design testing across mobile, tablet, and desktop breakpoints
- **TEST-010**: SSR compatibility testing with proper hydration behavior

**Visual Regression Testing:**
- **TEST-011**: Screenshot testing across all 10+ theme presets (GitHub, Material, Nord, etc.)
- **TEST-012**: Reduced motion visual testing with parallax effects disabled
- **TEST-013**: Multi-viewport testing (375px, 768px, 1440px) for responsive design
- **TEST-014**: Animation state testing with entering, visible, and exiting states
- **TEST-015**: Theme transition testing with smooth visual updates

**Performance Testing:**
- **TEST-016**: Bundle size impact testing to ensure <2KB gzipped addition
- **TEST-017**: 60fps scroll performance testing with Chrome DevTools
- **TEST-018**: Memory usage testing for long scroll sessions
- **TEST-019**: Mobile performance testing on low-end devices
- **TEST-020**: Build analysis integration with existing performance monitoring

## 7. Risks & Assumptions

**Technical Risks:**
- **RISK-001**: Parallax effects may cause motion sickness - Mitigated by proper reduced motion support
- **RISK-002**: Performance impact on mobile devices - Mitigated by GPU acceleration and RAF throttling
- **RISK-003**: Theme switching may cause visual flickering - Mitigated by proper CSS transitions
- **RISK-004**: Bundle size increase may impact performance budgets - Mitigated by tree-shaking and optimization

**Implementation Assumptions:**
- **ASSUMPTION-001**: Users have modern browsers with Intersection Observer support
- **ASSUMPTION-002**: Theme system CSS custom properties are properly configured
- **ASSUMPTION-003**: Existing visual testing infrastructure can handle new parallax tests
- **ASSUMPTION-004**: Performance budgets allow for additional 2KB of JavaScript
- **ASSUMPTION-005**: Current hero section can be enhanced without breaking existing functionality

## 8. Related Specifications / Further Reading

- [UseScrollAnimation.ts Hook Implementation](/src/hooks/UseScrollAnimation.ts) - Reference pattern for hook architecture
- [SkillsShowcase Compound Component](/src/components/SkillsShowcase.tsx) - Example compound component pattern
- [Theme System Documentation](/src/contexts/ThemeContext.tsx) - CSS custom properties integration
- [Visual Testing Guide](/tests/visual/README.md) - Visual regression testing patterns
- [Accessibility Guidelines](/src/utils/accessibility.ts) - Reduced motion and ARIA support
- [Performance Monitoring](/scripts/analyze-build.ts) - Bundle analysis integration
- [WCAG 2.1 AA Guidelines](https://www.w3.org/WAI/WCAG21/AA/) - Accessibility compliance requirements
- [Web Performance Best Practices](https://web.dev/performance/) - Performance optimization techniques
