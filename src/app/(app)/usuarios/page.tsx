import { redirect } from "next/navigation";
import { listarUsuarios, usuarioAtual } from "@/lib/usuarios";
import { fmtDataHora } from "@/lib/format";
import { ActionForm, Card, Input, Select, Pill, SubmitButton } from "@/components/ui";
import { alternarUsuarioAction, criarUsuarioAction, excluirUsuarioAction, redefinirSenhaAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Usuarios() {
  const eu = await usuarioAtual();
  if (!eu || eu.papel !== "admin") redirect("/");
  const usuarios = await listarUsuarios();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Usuários</h1>
          <p>Quem pode entrar no sistema. <b>Administrador</b> cadastra e altera; <b>Leitura</b> só consulta.</p>
        </div>
      </div>

      <Card title="Novo usuário">
        <ActionForm action={criarUsuarioAction} submitLabel="Cadastrar usuário">
          <Input label="Nome *" name="nome" required placeholder="Maria Silva" />
          <Input label="Login *" name="login" required placeholder="maria" autoCapitalize="none" />
          <Input label="Senha *" name="senha" type="password" required minLength={6} placeholder="mínimo 6 caracteres" />
          <Select label="Perfil *" name="papel" defaultValue="leitura">
            <option value="leitura">Leitura (só consulta)</option>
            <option value="admin">Administrador</option>
          </Select>
        </ActionForm>
      </Card>

      <Card title="Cadastrados" hint={String(usuarios.length)}>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Último acesso</th><th>Status</th><th>Nova senha</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => {
                const souEu = u.login === eu.login;
                return (
                  <tr key={u.id} className={u.ativo ? "" : "off"}>
                    <td><b>{u.nome}</b>{souEu && <span className="sub"> (você)</span>}</td>
                    <td className="mono">{u.login}</td>
                    <td>{u.papel === "admin" ? <Pill tone="accent">administrador</Pill> : <Pill>leitura</Pill>}</td>
                    <td className="sub">{fmtDataHora(u.ultimo_acesso)}</td>
                    <td>{u.ativo ? <Pill tone="ok">ativo</Pill> : <Pill tone="warn">bloqueado</Pill>}</td>
                    <td>
                      <form action={redefinirSenhaAction.bind(null, u.login)} style={{ display: "flex", gap: 6 }}>
                        <input name="senha" type="password" minLength={6} placeholder="nova senha" required style={{ width: 130, font: "inherit", fontSize: 12.5, border: "1px solid var(--line-strong)", borderRadius: 6, padding: "4px 8px", background: "var(--surface)", color: "var(--ink)" }} />
                        <SubmitButton tone="sm">Trocar</SubmitButton>
                      </form>
                    </td>
                    <td>
                      {!souEu && (
                        <div className="actions-row">
                          <form action={alternarUsuarioAction.bind(null, u.login, !u.ativo)}><SubmitButton tone="sm">{u.ativo ? "Bloquear" : "Liberar"}</SubmitButton></form>
                          <form action={excluirUsuarioAction.bind(null, u.login)}><SubmitButton tone="sm-danger">Excluir</SubmitButton></form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {usuarios.length === 0 && <tr><td colSpan={7} className="empty">Nenhum usuário no banco ainda — o acesso atual vem do .env. Cadastre-se aqui para ter um usuário definitivo.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
