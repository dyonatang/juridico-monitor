import { LoginForm } from "@/components/login-form";
import { LoginCasca } from "@/components/login-casca";

export const dynamic = "force-dynamic";

/** Login 2.0: cartão com borda de luz girando, emblema com órbitas e entrada em cascata. Só CSS. */
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <LoginCasca titulo="Entrar" sub="Acesso restrito à diretoria.">
      <LoginForm next={next ?? "/"} />
    </LoginCasca>
  );
}
