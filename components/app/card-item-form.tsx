"use client";

import { useActionState } from "react";

import { editCardItemAction, type CardsState } from "@/app/(app)/cards/actions";
import { Field, FormMessage, Input, Segmented, Select, SubmitButton } from "@/components/ui/form";

/** Tag, name and owner of a card purchase the bank still shows as pending. */
export function CardItemForm({
  item,
  tags,
  partnerName,
  returnTo,
}: {
  item: { accountId: string; providerId: string; tagId: string | null; description: string; scope: "mine" | "ours" | "partner" };
  tags: Array<{ id: string; name: string }>;
  partnerName: string | null;
  returnTo: string;
}) {
  const [state, action] = useActionState<CardsState, FormData>(editCardItemAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="accountId" value={item.accountId} />
      <input type="hidden" name="providerId" value={item.providerId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {partnerName ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">De quem é</legend>
          <Segmented name="scope" defaultValue={item.scope} options={[{ value: "ours", label: "Nosso" }, { value: "mine", label: "Meu" }, { value: "partner", label: `De ${partnerName}` }]} />
        </fieldset>
      ) : (
        <input type="hidden" name="scope" value="mine" />
      )}
      <Field label="Tag">
        <Select name="tagId" defaultValue={item.tagId ?? ""}>
          <option value="">Sem tag</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <Field label="Descrição"><Input name="description" defaultValue={item.description} maxLength={120} placeholder="Como o banco escreveu" /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Salvar</SubmitButton>
    </form>
  );
}
