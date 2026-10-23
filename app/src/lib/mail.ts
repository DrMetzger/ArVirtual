import "server-only";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contasEmail } from "@/db/schema";
import { decrypt } from "./crypto";

type Conta = typeof contasEmail.$inferSelect;

function transporter(c: Conta) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    secure: c.seguro,
    auth: { user: c.usuario, pass: decrypt(c.senhaEnc) },
  });
}

export async function enviarEmail(opts: {
  contaId?: number;
  para: string;
  assunto: string;
  html: string;
  anexos?: { filename: string; content: Buffer }[];
}) {
  const conta = opts.contaId
    ? await db.query.contasEmail.findFirst({ where: eq(contasEmail.id, opts.contaId) })
    : await db.query.contasEmail.findFirst({ where: eq(contasEmail.padrao, true) });
  if (!conta) throw new Error("Nenhuma conta de e-mail configurada.");
  await transporter(conta).sendMail({
    from: { name: conta.remetenteNome, address: conta.remetenteEmail },
    to: opts.para,
    subject: opts.assunto,
    html: opts.html,
    attachments: opts.anexos,
  });
}
