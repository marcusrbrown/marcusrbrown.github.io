import type {ReactNode} from 'react'
import {ThemeProvider} from '../src/contexts/ThemeContext'
import {useTheme} from '../src/hooks/UseTheme'

// Example component demonstrating the useTheme hook
const ThemeExample = () => {
  const {
    currentTheme,
    isDarkMode,
    isLightMode,
    isSystemMode,
    toggleTheme,
    switchToLight,
    switchToDark,
    switchToSystem,
    getEffectiveThemeMode,
    systemPreference,
  } = useTheme()

  return (
    <div style={{padding: '20px', backgroundColor: currentTheme.colors.background, color: currentTheme.colors.text}}>
      <h2>Theme Hook Example</h2>
      <div>
        <p>Current theme: {currentTheme.name}</p>
        <p>Theme mode: {isDarkMode ? 'Dark' : isLightMode ? 'Light' : 'System'}</p>
        <p>System preference: {systemPreference}</p>
        <p>Effective mode: {getEffectiveThemeMode()}</p>
        <p>Is system mode: {isSystemMode ? 'Yes' : 'No'}</p>
      </div>

      <div style={{marginTop: '20px'}}>
        <button onClick={toggleTheme} style={{marginRight: '10px'}}>
          Toggle Theme
        </button>
        <button onClick={switchToLight} style={{marginRight: '10px'}}>
          Light
        </button>
        <button onClick={switchToDark} style={{marginRight: '10px'}}>
          Dark
        </button>
        <button onClick={switchToSystem}>System</button>
      </div>
    </div>
  )
}

// Example app wrapper
const App = ({children}: {children: ReactNode}) => <ThemeProvider>{children}</ThemeProvider>

// Export for potential documentation/demo use
export {App, ThemeExample}
