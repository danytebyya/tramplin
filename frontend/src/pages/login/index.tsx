import { Link } from "react-router-dom";

export function LoginPage() {
  return (
    <main className="page-placeholder">
      <h1 className="page-placeholder__title">Login</h1>
      <p className="page-placeholder__text">Login form will be expanded after backend contract finalization.</p>
      <Link className="page-placeholder__link" to="/register">
        Go to registration
      </Link>
    </main>
  );
}
