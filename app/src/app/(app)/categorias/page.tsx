import { and, asc, isNull, sql } from "drizzle-orm";
import { ArrowDown, ArrowUp, Plus, Tags, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
} from "@/components/ui";
import { db } from "@/db";
import { categorias, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  criarCategoria,
  excluirCategoria,
  moverCategoria,
  renomearCategoria,
} from "./actions";
import { BotaoCategorizarIA } from "./botao-ia";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriasPage() {
  await requireUser();
  const lista = await db
    .select({
      id: categorias.id,
      nome: categorias.nome,
      produtos: sql<number>`(select count(*)::int from produtos p where p.categoria_id = "categorias"."id" and p.pai_id is null)`,
    })
    .from(categorias)
    .orderBy(asc(categorias.ordem), asc(categorias.nome));
  const [sem] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(produtos)
    .where(and(isNull(produtos.paiId), isNull(produtos.categoriaId)));

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Separam o catálogo, as grades de produtos e o Raio-X dos anúncios."
        actions={<BotaoCategorizarIA pendentes={sem?.n ?? 0} />}
      />
      <Card className="mb-6">
        <CardHeader title="Nova categoria" />
        <form action={criarCategoria} className="flex gap-3 p-5 pt-0">
          <Input
            name="nome"
            required
            maxLength={80}
            placeholder="Ex.: Acessórios Drones"
            className="flex-1"
          />
          <Button type="submit">
            <Plus /> Adicionar
          </Button>
        </form>
      </Card>
      <Card>
        <CardHeader
          title={`${lista.length} categorias`}
          description={
            sem?.n ? (
              <Link href="/produtos?cat=sem" className="hover:text-gold">
                {sem.n} produto(s) sem categoria
              </Link>
            ) : (
              "Todos os produtos têm categoria."
            )
          }
        />
        <ul className="divide-y divide-border">
          {lista.map((c, i) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 px-5 py-3"
            >
              <Tags className="size-4 shrink-0 text-muted" />
              <form
                action={renomearCategoria}
                className="flex min-w-0 flex-1 gap-2"
              >
                <input type="hidden" name="id" value={c.id} />
                <Input
                  name="nome"
                  defaultValue={c.nome}
                  required
                  maxLength={80}
                  className="min-w-0 flex-1"
                />
                <Button type="submit" variant="outline" size="sm">
                  Salvar
                </Button>
              </form>
              <Link href={`/produtos?cat=${c.id}`}>
                <Badge tone={c.produtos ? "blue" : "neutral"}>
                  {c.produtos} produtos
                </Badge>
              </Link>
              <form action={moverCategoria} className="flex gap-1">
                <input type="hidden" name="id" value={c.id} />
                <Button
                  type="submit"
                  name="dir"
                  value="cima"
                  variant="ghost"
                  size="sm"
                  disabled={i === 0}
                  title="Subir"
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="submit"
                  name="dir"
                  value="baixo"
                  variant="ghost"
                  size="sm"
                  disabled={i === lista.length - 1}
                  title="Descer"
                >
                  <ArrowDown />
                </Button>
              </form>
              <form action={excluirCategoria}>
                <input type="hidden" name="id" value={c.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  title="Excluir (os produtos ficam sem categoria)"
                >
                  <Trash2 className="text-red" />
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
