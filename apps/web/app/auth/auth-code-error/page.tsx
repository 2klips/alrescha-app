import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main>
      <section className="shell">
        <div className="eyebrow">Authentication failed</div>
        <h1>로그인 실패.</h1>
        <p>OAuth 응답을 검증하지 못했습니다. 다시 시도하세요.</p>
        <Link href="/auth/login">로그인으로 돌아가기</Link>
      </section>
    </main>
  );
}

