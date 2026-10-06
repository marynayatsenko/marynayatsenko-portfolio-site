import { NavLink, useLocation } from 'react-router-dom'

const CV_URL = 'https://flowcv.com/resume/8ccugdb2au'

export default function Nav() {
  const { pathname } = useLocation()
  // like the original site, the floating nav only exists on the home page and the gallery
  if (pathname !== '/' && pathname !== '/ui-gallery') return null
  return (
    <header className={'nav-wrap' + (pathname === '/ui-gallery' ? ' on-gallery' : '')}>
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          Home
        </NavLink>
        <NavLink to="/ui-gallery" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          Gallery
        </NavLink>
        <a className="nav-item nav-cv" href={CV_URL} target="_blank" rel="noopener noreferrer">
          CV
          <svg width="15" height="16" viewBox="0 0 14.4 16" aria-hidden="true">
            <path
              d="M 14.4 11.2 L 9.598 16 L 0.8 16 C 0.358 16 0 15.642 0 15.2 L 0 0.8 C 0 0.358 0.358 0 0.8 0 L 13.6 0 C 14.042 0 14.4 0.358 14.4 0.8 Z M 12.8 10.4 L 12.8 1.6 L 1.6 1.6 L 1.6 14.4 L 8.8 14.4 L 8.8 10.4 Z"
              fill="currentColor"
            />
          </svg>
        </a>
      </nav>
    </header>
  )
}
