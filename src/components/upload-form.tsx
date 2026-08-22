"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { importarPdfAction, type ImportState } from "@/app/actions";
import { SubmitButton, Select } from "./ui";

export function UploadForm({ documentos }: { documentos: { id: string; nome: string }[] }) {
  const [state, action] = useActionState<ImportState, FormData>(importarPdfAction, undefined);
  const [nomes, setNomes] = useState<string[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const escolher = (files: FileList | null) => setNomes(files ? Array.from(files).map((f) => f.name) : []);

  return (
    <form action={action} className="form">
      <div
        className={`dropzone ${arrastando ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (input.current) { input.current.files = e.dataTransfer.files; escolher(e.dataTransfer.files); }
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      >
        <input ref={input} type="file" name="arquivos" accept="application/pdf,.pdf" multiple hidden onChange={(e) => escolher(e.target.files)} />
        {nomes.length === 0 ? (
          <>
            <b>Arraste os PDFs aqui</b> ou clique para escolher
            <div className="hint">Pode enviar vários de uma vez.</div>
          </>
        ) : (
          <ul className="plain-list">{nomes.map((n) => <li key={n}>📄 {n}</li>)}</ul>
        )}
      </div>
      <Select label="Vínculo (opcional — o sistema tenta descobrir sozinho)" name="documento_id" defaultValue="">
        <option value="">— detectar automaticamente —</option>
        {documentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
      </Select>
      <div className="actions">
        <SubmitButton>Enviar e ler</SubmitButton>
        <span className="hint">A leitura por IA leva de 20 s a 2 min por documento.</span>
      </div>

      {state?.erro && <div className="notice bad" style={{ gridColumn: "1 / -1" }}>{state.erro}</div>}
      {state?.resultados && (
        <div className="notice ok" style={{ gridColumn: "1 / -1" }}>
          {state.resultados.map((r) => (
            <div key={r.nome} style={{ marginBottom: 6 }}>
              <b>{r.nome}</b>: {r.erro ? <span style={{ color: "var(--bad)" }}>{r.erro}</span> : r.processos.length === 0 ? "nenhum número de processo encontrado" : (
                <>
                  {r.processos.map((p) => (
                    <span key={p.numero}>
                      <Link href={`/processos/${p.numero}`} className="mono link">{p.numero_formatado}</Link>
                      {p.criado ? ` (cadastrado, ${p.novas} movimentações)` : " (já existia)"}{p.erro ? ` — ${p.erro}` : ""}{" "}
                    </span>
                  ))}
                </>
              )}
              {r.resumo && <div className="sub">{r.resumo}</div>}
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
