import { SignUpForm } from "../auth-forms";

export const metadata = { title: "Criar conta · Prumo" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium tracking-[-0.02em]">Criar conta</h1>
      <p className="mb-5 text-sm text-muted-foreground">Leva menos de um minuto.</p>
      <SignUpForm />
    </>
  );
}
