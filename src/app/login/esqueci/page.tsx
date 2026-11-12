import Link from "next/link";
import { EsqueciForm } from "@/components/login-form";
import { LoginCasca } from "@/components/login-casca";
import { recuperacaoDisponivel } from "@/lib/recuperacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Esqueci minha senha · Jurídico Monitor" };

export default function Esqueci() {
  if (!recuperacaoDisponivel()) {
    return (
      <LoginCasca titulo="Esqueci minha senha" sub="O envio do link por e-mail ainda está sendo ativado. Por enquanto, peça a um administrador para trocar sua senha na tela Usuários.">
        <div className="login-form"><Link href="/login" className="login-link">Voltar para o login</Link></div>
      </LoginCasca>
    );
  }
  return (
    <LoginCasca titulo="Esqueci minha senha" sub="Mandamos um link para o e-mail cadastrado. Por ele você escolhe uma senha nova.">
      <EsqueciForm />
    </LoginCasca>
  );
}
