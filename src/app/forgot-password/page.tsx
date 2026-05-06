import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight mb-2">Mot de passe oublié</h1>
        <p className="text-sm text-zinc-500 mb-6">Saisissez votre email. Si un compte existe, vous recevrez une procédure.</p>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}

