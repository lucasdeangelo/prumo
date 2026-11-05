import { whatsappUnlinkAction } from "@/app/(app)/actions";
import { PageHeader } from "@/components/app/bits";
import { WhatsappLinkCode } from "@/components/app/whatsapp-link";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { getWhatsappLink } from "@/lib/repositories/reads";

export const metadata = { title: "WhatsApp · Prumo" };

export default async function WhatsappPage() {
  const { user, db } = await requireUser();
  const link = await getWhatsappLink(db, user.id);
  const linked = link?.verified_at ? link : null;
  return (
    <div className="grid gap-4">
      <PageHeader title="WhatsApp" back="/settings" />
      <Card className="grid gap-3">
        {linked ? (
          <>
            <p className="text-[15px]">
              {linked.chat_id?.endsWith("@lid") || !linked.phone_normalized ? "WhatsApp vinculado" : <>Vinculado ao número <strong className="tabular">{linked.phone_normalized}</strong></>}. Envie <em>ajuda</em> para o bot ver os comandos.
            </p>
            <form action={whatsappUnlinkAction}>
              <SubmitButton variant="ghost" className="w-full text-danger" pendingText="…">Desvincular</SubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Registre gastos por mensagem e receba avisos de contas, assinaturas, orçamento do lar e combinados.</p>
            <WhatsappLinkCode botNumber={process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER} />
          </>
        )}
      </Card>
      <Card className="grid gap-1.5 text-sm">
        <p className="label-mono">Exemplos</p>
        <p>gastei 45,90 no mercado</p>
        <p>recebi 3500 salário</p>
        <p>paguei aluguel</p>
        <p>resumo · saldo · contas · assinaturas</p>
      </Card>
    </div>
  );
}
