import { AUTH } from "../../../lib/strings";
import { SignInButton } from "./sign-in-button";

export default function LoginPage() {
  return (
    <main>
      <section className="shell" aria-labelledby="login-title">
        <div className="eyebrow">{AUTH.login.eyebrow}</div>
        <h1 id="login-title">{AUTH.login.title}</h1>
        <p>{AUTH.login.body}</p>
        <SignInButton />
      </section>
    </main>
  );
}

