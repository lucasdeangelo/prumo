import { SignInForm } from "../auth-forms";

export const metadata = { title: "Entrar · Prumo" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-2xl font-medium tracking-[-0.02em]">Entrar</h1>
      <p className="mb-5 text-sm text-muted-foreground">Acompanhe suas entradas e saídas.</p>
      {erro ? <p role="alert" className="mb-4 rounded-[10px] bg-danger-bg px-3 py-2 text-sm text-danger">Link inválido ou expirado. Tente novamente.</p> : null}
      <SignInForm next={next} />
    </>
  );
}
