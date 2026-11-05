import { Trash2 } from "lucide-react";

import { deleteRuleAction } from "@/app/(app)/actions";
import { PageHeader, TagDot } from "@/components/app/bits";
import { RuleForm, TagForm } from "@/components/app/forms";
import { Card, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { listRules, listTags } from "@/lib/repositories/reads";

export const metadata = { title: "Tags e regras · Prumo" };

const TYPE_LABEL = { contains: "contém", description: "começa com", exact: "é igual a", merchant: "estabelecimento" } as const;

export default async function TagsPage() {
  const { user, db } = await requireUser();
  const [tags, rules] = await Promise.all([listTags(db, user.id), listRules(db, user.id)]);
  const tagById = new Map(tags.map((t) => [t.id, t]));

  return (
    <div className="grid gap-4">
      <PageHeader title="Tags e regras" back="/settings" />
      <Card>
        <CardTitle>Como a tag é escolhida</CardTitle>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Suas regras (abaixo) — sempre ganham.</li>
          <li>Nome do estabelecimento (iFood, Uber, Netflix…).</li>
          <li>Categoria informada pelo banco.</li>
          <li>Se nada bater: “Outros”. Corrija e marque “usar sempre” para criar uma regra.</li>
        </ol>
      </Card>

      <Card>
        <CardTitle>Regras ({rules.length})</CardTitle>
        {rules.length > 0 ? (
          <ul className="mb-4 divide-y divide-border">
            {rules.map((rule) => {
              const tag = tagById.get(rule.tag_id);
              return (
                <li key={rule.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">{TYPE_LABEL[rule.pattern_type]}</span> “{rule.pattern}”
                  </span>
                  <span className="flex items-center gap-1.5"><TagDot color={tag?.color} />{tag?.name}</span>
                  <form action={deleteRuleAction}>
                    <input type="hidden" name="id" value={rule.id} />
                    <button type="submit" aria-label={`Remover regra ${rule.pattern}`} className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}
        <RuleForm tags={tags} />
      </Card>

      <Card>
        <CardTitle>Tags ({tags.length})</CardTitle>
        <ul className="mb-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm">
              <TagDot color={tag.color} /> {tag.name}
              {tag.excluded_from_totals ? <span className="text-xs text-muted-foreground">(fora dos totais)</span> : null}
            </li>
          ))}
        </ul>
        <TagForm />
      </Card>
    </div>
  );
}
