import { useState } from "react";
import { ArrowLeft, ShieldCheck, MapPin, CheckCircle2 } from "lucide-react";
import { authClient } from "../lib/auth";
export default function SignIn() {
  const [signup, setSignup] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const d = new FormData(e.currentTarget);
    try {
      const args = { email: String(d.get("email")), password: String(d.get("password")) };
      const result = signup
        ? await authClient.signUp.email({ ...args, name: String(d.get("name")) })
        : await authClient.signIn.email(args);
      if (result.error)
        setError(
          result.error.code === "INVALID_EMAIL_OR_PASSWORD"
            ? "البريد أو كلمة المرور غير صحيحة"
            : result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
              ? "البريد مسجل بالفعل؛ اختار تسجيل الدخول"
              : result.error.message || "تعذر تسجيل الدخول",
        );
    } catch {
      setError("تعذر الاتصال. راجع الإنترنت وحاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div dir="rtl" className="auth-page">
      <section className="auth-story">
        <div className="wordmark">
          midway<span>FIELD CRM</span>
        </div>
        <div className="auth-copy">
          <div className="eyebrow">شغلك الميداني، في مكان واحد</div>
          <h1>
            كل زيارة بداية
            <br />
            لعلاقة أقوى.
          </h1>
          <p>
            اعرف مين تزور، افتكر اللي اتفقت عليه،
            <br />
            وخلي المتابعة خطوة واضحة مش مجرد ملاحظة.
          </p>
          <div className="auth-features">
            <span>
              <CheckCircle2 size={19} /> سجل الشركات والزيارات
            </span>
            <span>
              <MapPin size={19} /> رتب يومك ومتابعاتك
            </span>
            <span>
              <ShieldCheck size={19} /> بيانات خاصة بكل حساب
            </span>
          </div>
        </div>
        <small>Midway for Tourism · إدارة علاقات العملاء</small>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-card"><strong className="login-app-title" dir="ltr">eslam b2b Sales attract</strong>
          <span className="tag teal">مساحة عملك الميدانية</span>
          <h2>{signup ? "ابدأ بحساب جديد" : "أهلًا، نكمل الشغل؟"}</h2>
          <p>
            {signup
              ? "بياناتك تبدأ فارغة، وتفضل محفوظة بين زياراتك."
              : "سجّل دخولك للوصول لشركاتك ومتابعاتك."}
          </p>
          <div className="auth-tabs">
            <button
              className={!signup ? "active" : ""}
              onClick={() => {
                setSignup(false);
                setError("");
              }}
            >
              تسجيل الدخول
            </button>
            <button
              className={signup ? "active" : ""}
              onClick={() => {
                setSignup(true);
                setError("");
              }}
            >
              حساب جديد
            </button>
          </div>
          <form onSubmit={submit}>
            {signup && (
              <label className="field">
                <span>اسمك</span>
                <input
                  aria-label="اسمك"
                  name="name"
                  required
                  autoComplete="name"
                  placeholder="الاسم بالكامل"
                />
              </label>
            )}
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input
                aria-label="البريد الإلكتروني"
                name="email"
                required
                type="email"
                autoComplete="email"
                dir="ltr"
                placeholder="you@company.com"
              />
            </label>
            <label className="field">
              <span>كلمة المرور</span>
              <input
                aria-label="كلمة المرور"
                name="password"
                required
                type="password"
                minLength={8}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder="٨ أحرف على الأقل"
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary full" disabled={pending}>
              {pending ? "جاري الدخول…" : signup ? "إنشاء حساب" : "تسجيل الدخول"}
              <ArrowLeft size={18} />
            </button>
          </form>
          <div className="divider">
            <span>أو</span>
          </div>
          <button
            className="secondary full google"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                const r = await authClient.managedAuth.signIn({ provider: "google" });
                if (r.error && r.error.code !== "POPUP_CLOSED") setError(r.error.message);
              } catch {
                setError("تعذر تسجيل الدخول باستخدام Google؛ يمكنك استخدام البريد وكلمة المرور.");
              } finally {
                setPending(false);
              }
            }}
          >
            <b>G</b> متابعة باستخدام Google
          </button>
          <div className="auth-note">
            <ShieldCheck size={17} />
            <span>بيانات حسابك لا تظهر لأي مستخدم آخر. يحتاج التطبيق اتصالًا بالإنترنت.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
