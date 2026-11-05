import { SignInForm } from "../auth-forms";

export const metadata = { title: "Entrar · Prumo" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
      <p className="mb-5 text-sm text-muted-foreground">Acompanhe suas entradas e saídas.</p>
      {erro ? <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">Link inválido ou expirado. Tente novamente.</p> : null}
      <SignInForm next={next} />
    </>
  );
}
