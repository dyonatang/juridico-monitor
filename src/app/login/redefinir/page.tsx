import Link from "next/link";
import { RedefinirForm } from "@/components/login-form";
import { LoginCasca } from "@/components/login-casca";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova senha · Jurídico Monitor" };

/** Destino do link enviado por e-mail (Firebase): ?u=<login>&oobCode=… */
export default async function Redefinir({ searchParams }: { searchParams: Promise<{ u?: string; oobCode?: string }> }) {
  const { u, oobCode } = await searchParams;
  if (!u || !oobCode) {
    return (
      <LoginCasca titulo="Link incompleto" sub="Abra o link exatamente como chegou no e-mail, ou peça um novo.">
        <div className="login-form"><Link href="/login/esqueci" className="btn primary" style={{ textAlign: "center" }}>Pedir um novo link</Link></div>
      </LoginCasca>
    );
  }
  return (
    <LoginCasca titulo="Escolha a nova senha" sub={`Usuário: ${u}`}>
      <RedefinirForm u={u} oobCode={oobCode} />
    </LoginCasca>
  );
}
