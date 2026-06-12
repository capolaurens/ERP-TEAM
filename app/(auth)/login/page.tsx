import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#1b1b1b] to-[#2b2320] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/navyx_logo.avif"
            alt="Navyx"
            className="mb-4 h-10 w-auto"
          />
          <p className="text-sm text-white/60">Gestión interna del equipo</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-2xl">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-white/40">
          Navyx · acceso del equipo
        </p>
      </div>
    </div>
  );
}
