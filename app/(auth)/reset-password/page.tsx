import { ResetPasswordForm } from "../auth-forms";

export const metadata = { title: "Nova senha · Prumo" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-5 text-2xl font-medium tracking-[-0.02em]">Criar nova senha</h1>
      <ResetPasswordForm />
    </>
  );
}
