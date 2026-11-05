import { ForgotPasswordForm } from "../auth-forms";

export const metadata = { title: "Recuperar senha · Prumo" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Recuperar senha</h1>
      <p className="mb-5 text-sm text-muted-foreground">Enviaremos um link para criar uma nova senha.</p>
      <ForgotPasswordForm />
    </>
  );
}
