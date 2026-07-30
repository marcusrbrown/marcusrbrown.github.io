import type React from 'react'
import {useLocation} from 'react-router-dom'
import {usePageviewTracking} from '../hooks/UseAnalytics'

/**
 * Invisible route-aware pageview tracker. Must render inside `BrowserRouter`
 * so `useLocation` observes every real navigation. Only `location.pathname`
 * is passed through, so query/hash-only changes are ignored. All
 * pageview-source behavior lives in `usePageviewTracking`.
 */
export const AnalyticsTracker: React.FC = () => {
  const {pathname} = useLocation()
  usePageviewTracking(pathname)
  return null
}
