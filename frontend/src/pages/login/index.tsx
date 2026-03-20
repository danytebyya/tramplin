import { Link } from "react-router-dom";
import "./login.css";

export function LoginPage() {
  return (
    <main className="login-page">
      <h1 className="login-page__title">Login</h1>
      <p className="login-page__text">Login form will be expanded after backend contract finalization.</p>
      <Link className="login-page__link" to="/register">
        Go to registration
      </Link>
    </main>
  );
}
