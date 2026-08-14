import { SignInButton } from "./sign-in-button";

export default function LoginPage() {
  return (
    <main>
      <section className="shell" aria-labelledby="login-title">
        <div className="eyebrow">Secure workspace access</div>
        <h1 id="login-title">Sign in.</h1>
        <p>GitHub OAuth로 인증합니다. 연결한 레포와 증거는 개인 workspace에 격리됩니다.</p>
        <SignInButton />
      </section>
    </main>
  );
}

