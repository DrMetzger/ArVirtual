"use client";

import { useEffect } from "react";

/**
 * Copia o nome de cada coluna (cabeçalho) para as células das tabelas .table-base (data-label): no celular a tabela
 * vira cartões e o CSS mostra esse nome em cima de cada valor. Acompanha tabelas que mudam ou aparecem depois.
 */
export function TabelasResponsivas() {
  useEffect(() => {
    const rotular = () => {
      for (const tabela of document.querySelectorAll<HTMLTableElement>("table.table-base")) {
        const nomes: string[] = [];
        for (const th of tabela.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th")) {
          for (let i = 0; i < (th.colSpan || 1); i++) nomes.push(th.textContent?.trim() ?? "");
        }
        if (!nomes.length) continue;
        for (const tr of tabela.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
          let col = 0;
          for (const td of tr.cells) {
            const nome = nomes[col] ?? "";
            if (td.getAttribute("data-label") !== nome) td.setAttribute("data-label", nome);
            col += td.colSpan || 1;
          }
        }
      }
    };
    rotular();
    let agendado = 0;
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(agendado);
      agendado = requestAnimationFrame(rotular);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      cancelAnimationFrame(agendado);
    };
  }, []);
  return null;
}
