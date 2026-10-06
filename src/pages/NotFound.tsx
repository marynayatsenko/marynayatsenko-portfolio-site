import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="page notfound">
      <h2 className="nf-title">Page not found</h2>
      <Link to="/" className="back">
        Back to home
      </Link>
    </main>
  )
}
