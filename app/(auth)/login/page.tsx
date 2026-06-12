import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold">
            N
          </div>
          <h1 className="text-2xl font-semibold">ERP Navyx</h1>
          <p className="text-sm text-slate-300">Accede con tu usuario</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Gestión interna del equipo · Navyx
        </p>
      </div>
    </div>
  );
}
