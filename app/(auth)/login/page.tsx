import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#0f0f0f] p-4">
      {/* auroras de marca */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 size-[460px] rounded-full bg-brand-orange/30 blur-[130px]"
        style={{ animation: "float-slow 9s ease-in-out infinite" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-44 -right-32 size-[440px] rounded-full bg-brand-red/30 blur-[130px]"
        style={{ animation: "float-slow 12s ease-in-out infinite" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-7 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/navyx_logo.avif"
            alt="Navyx"
            className="mb-4 h-10 w-auto drop-shadow-lg"
          />
          <p className="text-sm text-white/60">Gestión interna del equipo</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-float">
          <LoginForm />
        </div>
        <p className="mt-5 text-center text-xs text-white/40">
          Navyx · acceso del equipo
        </p>
      </div>
    </div>
  );
}
