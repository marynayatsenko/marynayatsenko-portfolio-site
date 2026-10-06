import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import Home from './pages/Home'
import CasePage from './pages/CasePage'
import Gallery from './pages/Gallery'
import NotFound from './pages/NotFound'

export default function App() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ui-gallery" element={<Gallery />} />
        <Route path="/case-admin-system" element={<CasePage slug="case-admin-system" />} />
        <Route path="/case-claim-statement" element={<CasePage slug="case-claim-statement" />} />
        <Route path="/massage-chair" element={<CasePage slug="massage-chair" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
