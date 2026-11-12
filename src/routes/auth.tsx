import { Link, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateAuthField, validateAuthForm, type AuthField } from "@/lib/auth-validation";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoMark from "@/assets/upoharkabbo-logo.png";
import { Turnstile, type TurnstileHandle } from "@/components/turnstile";

export const Route = createFileRoute("/auth")({
  head: () => ({
    links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Figtree:wght@400;500;600;700&display=swap" }],
    meta: [
      { title: "Staff sign in — Upoharkabbo (upoharkabbo.com)" },
      {
        name: "description",
        content:
          "Official Upoharkabbo staff and administrator sign-in. Access for authorized team members only.",
      },
      { name: "robots", content: "noindex, follow" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Staff sign in — Upoharkabbo" },
      {
        property: "og:description",
        content: "Official sign-in for the Upoharkabbo store management panel.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  // Public sign-up is not offered on this page — an open credential-creation form
  // on a store's admin login is what Safe Browsing flags as a deceptive login.
  // Team members can still register via /auth?signup=1.
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const signupAllowed = /(^|[?&])signup=1(&|$)/.test(searchStr ?? "");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<AuthField, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<AuthField, boolean>>>({});
  const [capsField, setCapsField] = useState<AuthField | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle | null>(null);

  function checkField(field: AuthField, value: string) {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => ({ ...current, [field]: validateAuthField(field, value) }));
  }

  function changeField(field: AuthField, value: string) {
    if (field === "email") setEmail(value);
    if (field === "password") setPassword(value);
    if (field === "fullName") setFullName(value);
    setFormError(null);
    if (touched[field]) setErrors((current) => ({ ...current, [field]: validateAuthField(field, value) }));
  }

  const syncCaps = (field: AuthField) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsField(event.getModifierState("CapsLock") ? field : null);
  };

  function switchMode() {
    setMode((current) => current === "signin" ? "signup" : "signin");
    setErrors({});
    setTouched({});
    setFormError(null);
    setShowPassword(false);
  }

  async function signInWithGoogle() {
    setGoogleBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (err) {
      setGoogleBusy(false);
      toast.error(err instanceof Error ? err.message : "Unable to start Google sign-in.");
    }
  }

  useEffect(() => {
    if (!signupAllowed) setMode("signin");
  }, [signupAllowed]);

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/admin" });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || googleBusy) return;
    const nextErrors = validateAuthForm({ email, password, fullName }, mode === "signup");
    setErrors(nextErrors);
    setTouched({ email: true, password: true, fullName: mode === "signup" });
    setFormError(null);
    const firstInvalid = (["fullName", "email", "password"] as AuthField[]).find((field) => nextErrors[field]);
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    if (!captchaToken) {
      setFormError("Complete the security check before signing in.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          ...(captchaToken ? { options: { captchaToken } } : {}),
        });
        if (error) throw error;
        toast.success("Successfully signed in");
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin`,
            data: { full_name: fullName.trim() },
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (error) throw error;
        toast.success("Account created");
      }
      await navigate({ to: "/admin" });
    } catch (err) {
      const message = err instanceof Error && err.message === "Invalid login credentials"
        ? "Your email or password is incorrect. Please try again."
        : err instanceof Error && err.message.toLowerCase().includes("captcha")
          ? "Security verification failed. Please verify again."
          : "Unable to sign in. Check your details and connection, then try again.";
      setFormError(message);
      captchaRef.current?.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main lang="en" className="auth-page min-h-svh bg-background text-foreground">
      <div className="auth-layout mx-auto grid min-h-svh max-w-[1600px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="auth-brand-panel relative flex min-w-0 flex-col justify-between overflow-hidden border-b border-border px-6 py-6 sm:px-10 lg:min-h-svh lg:border-b-0 lg:px-12 lg:py-10 xl:px-16">
          <Link to="/" className="auth-logo-link auth-enter relative z-10 block w-fit" aria-label="Upoharkabbo home">
            <img src={logoMark} alt="Upoharkabbo" className="h-auto w-56 max-w-full object-contain sm:w-64" />
          </Link>
          <div className="auth-brand-copy auth-enter relative z-10 my-auto max-w-xl py-12 lg:py-16">
            <div className="mb-7 inline-flex items-center gap-2.5 border-l-2 border-primary pl-3 text-xs font-semibold uppercase text-primary">
              <LockKeyhole className="size-3.5" aria-hidden="true" /> Internal access only
            </div>
            <h1 className="auth-headline font-bold leading-[1.04]">Crafting<br /><span className="text-primary">Love</span> Stories.</h1>
            <p className="mt-7 max-w-sm text-base leading-7 text-muted-foreground sm:text-lg">
              The exclusive management portal for the Upoharkabbo team. Every gift holds a story of love.
            </p>
          </div>
          <div className="auth-enter relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
            <Link to="/" className="group inline-flex min-h-11 items-center gap-2 transition-colors hover:text-primary"><ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" /> Return to storefront</Link>
            <span className="hidden items-center gap-2 xl:flex"><LockKeyhole className="size-3.5" aria-hidden="true" /> Authorized team access</span>
          </div>
        </section>
        <section className="auth-form-panel flex min-w-0 items-center justify-center px-6 py-10 sm:px-10 lg:border-l lg:border-border lg:px-9 xl:px-12">
          <div className="auth-form-content w-full max-w-md">
            <header className="auth-enter mb-8">
              <Link to="/" className="auth-logo-link mb-6 hidden w-fit lg:block" aria-label="Upoharkabbo home"><img src={logoMark} alt="Upoharkabbo" className="h-auto w-48 max-w-full object-contain" /></Link>
              <h2 className="text-3xl font-semibold leading-tight">{mode === "signin" ? "Welcome back" : "Join the team"}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === "signin" ? "Sign in to your Upoharkabbo workspace." : "Create your staff account to continue."}</p>
            </header>
            <Button type="button" variant="outline" onClick={signInWithGoogle} loading={googleBusy} disabled={busy || googleBusy} className="auth-social auth-enter h-13 w-full gap-3 rounded-lg">
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path className="auth-google-blue" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z" />
              <path className="auth-google-green" d="M12 24c3.24 0 5.96-1.08 7.94-2.93l-3.88-3c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.09A12 12 0 0 0 12 24Z" />
              <path className="auth-google-yellow" d="M5.29 14.27a7.2 7.2 0 0 1 0-4.54V6.64H1.28a12 12 0 0 0 0 10.72l4.01-3.09Z" />
              <path className="auth-google-red" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.17 15.23 0 12 0A12 12 0 0 0 1.28 6.64l4.01 3.09C6.23 6.86 8.88 4.75 12 4.75Z" />
            </svg>
              {googleBusy ? "Connecting to Google…" : "Continue with Google"}
            </Button>
            <div className="auth-enter my-6 flex items-center gap-4"><span className="h-px flex-1 bg-border" /><span className="text-[11px] font-medium uppercase text-muted-foreground">Or secure login</span><span className="h-px flex-1 bg-border" /></div>
            <form onSubmit={submit} noValidate className="auth-enter space-y-5" aria-busy={busy}>
              {mode === "signup" ? (
                <div className="auth-field space-y-2">
                  <Label htmlFor="fullName" className="text-xs font-semibold uppercase text-muted-foreground">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => changeField("fullName", e.target.value)} onBlur={() => checkField("fullName", fullName)} autoComplete="name" placeholder="Your full name" maxLength={100} required disabled={busy || googleBusy} aria-invalid={Boolean(errors.fullName)} aria-describedby="fullName-feedback" className={cn("auth-input h-14", errors.fullName && "border-destructive focus-visible:ring-destructive")} />
                  <FieldFeedback id="fullName-feedback" error={errors.fullName} />
                </div>
              ) : null}
              <div className="auth-field space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold uppercase text-muted-foreground">Work email</Label>
                <div className="relative"><Mail className="auth-field-icon pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="email" type="email" value={email} onChange={(e) => changeField("email", e.target.value)} onKeyUp={syncCaps("email")} onKeyDown={syncCaps("email")} onBlur={() => { setCapsField(null); checkField("email", email); }} autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="name@company.com" maxLength={254} required disabled={busy || googleBusy} aria-invalid={Boolean(errors.email)} aria-describedby="email-feedback" className={cn("auth-input h-14 pl-11", errors.email && "border-destructive focus-visible:ring-destructive")} />
                </div>
                <FieldFeedback id="email-feedback" error={errors.email} caps={capsField === "email"} />
              </div>
              <div className="auth-field space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold uppercase text-muted-foreground">Password</Label>
                <div className="relative"><KeyRound className="auth-field-icon pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => changeField("password", e.target.value)} onKeyUp={syncCaps("password")} onKeyDown={syncCaps("password")} onBlur={() => { setCapsField(null); checkField("password", password); }} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="Enter your password" minLength={6} required disabled={busy || googleBusy} aria-invalid={Boolean(errors.password)} aria-describedby="password-feedback" className={cn("auth-input h-14 pl-11 pr-14", errors.password && "border-destructive focus-visible:ring-destructive")} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} disabled={busy || googleBusy} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} aria-controls="password" className="absolute right-1.5 top-1/2 size-11 -translate-y-1/2 text-muted-foreground hover:text-primary">
                    {showPassword ? <EyeOff className="auth-eye" aria-hidden="true" /> : <Eye className="auth-eye" aria-hidden="true" />}
                  </Button>
                </div>
                <FieldFeedback id="password-feedback" error={errors.password} caps={capsField === "password"} />
              </div>
              <div className="flex min-h-20 items-center justify-center rounded-lg border border-border bg-muted/30 py-2"><Turnstile onToken={setCaptchaToken} handleRef={captchaRef} theme="dark" /></div>
              {formError ? <div role="alert" className="auth-feedback flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm leading-6 text-destructive"><AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden="true" />{formError}</div> : null}
              <Button type="submit" loading={busy} className="auth-submit group h-14 w-full rounded-lg text-base font-bold" disabled={busy || googleBusy || !captchaToken}>
                {busy ? "Please wait…" : mode === "signin" ? "Access system" : "Create account"}
                {!busy ? <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden="true" /> : null}
              </Button>
            </form>
            {signupAllowed ? <Button type="button" variant="link" onClick={switchMode} disabled={busy || googleBusy} className="mt-4 h-auto min-h-11 w-full whitespace-normal text-center">{mode === "signin" ? "Create a staff account" : "Already have an account? Sign in"}</Button> : null}
            <footer className="auth-enter mt-8 space-y-5 text-center text-xs leading-6 text-muted-foreground">
              <p>For authorized team members only. Accounts are managed by your administrator. <Link to="/contact" className="text-foreground underline underline-offset-4 transition-colors hover:text-primary">Contact support</Link></p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]"><span>© 2026 Upoharkabbo</span><Link to="/privacy-policy" className="inline-flex min-h-9 items-center transition-colors hover:text-primary">Privacy</Link><Link to="/terms-and-conditions" className="inline-flex min-h-9 items-center transition-colors hover:text-primary">Terms</Link><Link to="/contact" className="inline-flex min-h-9 items-center transition-colors hover:text-primary">Support</Link></div>
              <p className="text-[11px]">upoharkabbo.com · Shopping does not require sign-in.</p>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

function FieldFeedback({ id, error, caps }: { id: string; error?: string | undefined; caps?: boolean }) {
  return (
    <div id={id} aria-live="polite" aria-atomic="true" className="space-y-1">
      {error ? <p className="auth-feedback flex items-start gap-1.5 text-xs leading-5 text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{error}</p> : null}
      {caps ? <p className="auth-feedback flex items-start gap-1.5 text-xs leading-5 text-primary"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Caps Lock is on — check your typing.</p> : null}
    </div>
  );
}
