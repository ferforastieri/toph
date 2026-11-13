import { useEffect, useState } from "react";
import { ArrowLeft, Mail, Plus, RefreshCw, Send, Trash2 } from "@toph/icons";
import { api, type EmailAccount, type EmailAccountInput, type EmailMessage, type EmailMessageSummary } from "../../../shared/api";
import { useApp } from "../../../app/store";
import { useConfirm } from "../../../shared/ui/confirm";
import { Button } from "@/shared/toph-ui/base/buttons/button";
import { Input } from "@/shared/toph-ui/base/input/input";
import { Select, SelectItem } from "@/shared/toph-ui/base/select/select";
import { Textarea } from "@/shared/toph-ui/base/textarea/textarea";
import LoadingState from "../../../shared/ui/LoadingState";

const EMPTY_ACCOUNT: EmailAccountInput = {
  name: "",
  email: "",
  fromName: "",
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPassword: "",
  imapTls: true,
  imapSecurity: "ssl",
  smtpHost: "",
  smtpPort: 465,
  smtpUser: "",
  smtpPassword: "",
  smtpTls: true,
  smtpSecurity: "ssl",
};

function accountFrom(input: EmailAccountInput): EmailAccountInput {
  return {
    ...input,
    imapUser: input.imapUser || input.email,
    smtpUser: input.smtpUser || input.email,
  };
}

export default function EmailPanel() {
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<EmailAccountInput>(EMPTY_ACCOUNT);
  const [selected, setSelected] = useState<EmailAccount | null>(null);
  const [messages, setMessages] = useState<EmailMessageSummary[] | null>(null);
  const [message, setMessage] = useState<EmailMessage | null>(null);
  const [compose, setCompose] = useState<{ to: string; subject: string; text: string; inReplyTo?: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      setAccounts(await api.emailAccounts());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as contas de email.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function update(patch: Partial<EmailAccountInput>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function create() {
    setBusy("create");
    try {
      await api.createEmailAccount(accountFrom(form));
      setAdding(false);
      setForm(EMPTY_ACCOUNT);
      await load();
      notify("success", "Conta de email adicionada.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível adicionar a conta.");
    } finally {
      setBusy("");
    }
  }

  async function remove(account: EmailAccount) {
    const ok = await confirm({
      title: "Remover conta de email?",
      message: `Remover ${account.email}? As credenciais serão apagadas do Toph.`,
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteEmailAccount(account.id);
      await load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível remover a conta.");
    }
  }

  async function test(account: EmailAccount) {
    setBusy(`test:${account.id}`);
    try {
      await api.testEmailAccount(account.id);
      notify("success", `${account.email} está acessível.`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Falha ao conectar na conta.");
    } finally {
      setBusy("");
    }
  }

  async function openInbox(account: EmailAccount) {
    setSelected(account);
    setMessages(null);
    setMessage(null);
    setBusy(`inbox:${account.id}`);
    try {
      setMessages(await api.emailMessages(account.id, 30));
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível abrir a caixa de entrada.");
    } finally {
      setBusy("");
    }
  }

  async function openMessage(summary: EmailMessageSummary) {
    if (!selected) return;
    setBusy(`message:${summary.uid}`);
    try {
      setMessage(await api.emailMessage(selected.id, summary.uid));
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível ler o email.");
    } finally {
      setBusy("");
    }
  }

  async function deleteMessage(target: EmailMessage | EmailMessageSummary) {
    if (!selected) return;
    const ok = await confirm({ title: "Excluir email?", message: target.subject || "Mover para a lixeira?", confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    try {
      await api.deleteEmailMessage(selected.id, target.uid);
      setMessage(null);
      await openInbox(selected);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível excluir o email.");
    }
  }

  async function send() {
    if (!selected || !compose) return;
    setBusy("send");
    try {
      await api.sendEmail(selected.id, {
        to: compose.to,
        subject: compose.subject,
        text: compose.text,
        inReplyTo: compose.inReplyTo,
      });
      setCompose(null);
      notify("success", "Email enviado.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível enviar o email.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <LoadingState label="Carregando emails..." />;

  if (selected && compose) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar" onClick={() => setCompose(null)} />
          <strong className="text-body-medium text-text-primary">Novo email</strong>
        </div>
        <Input label="Para" value={compose.to} onChange={(value) => setCompose({ ...compose, to: value })} placeholder="destinatario@exemplo.com" />
        <Input label="Assunto" value={compose.subject} onChange={(value) => setCompose({ ...compose, subject: value })} />
        <Textarea value={compose.text} onChange={(value) => setCompose({ ...compose, text: value })} rows={8} aria-label="Corpo do email" placeholder="Escreva seu email..." />
        <Button className="w-full justify-center" leadingIcon={Send} disabled={busy === "send" || !compose.to.trim()} onClick={() => void send()}>
          {busy === "send" ? "Enviando..." : "Enviar"}
        </Button>
      </div>
    );
  }

  if (selected && message) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar" onClick={() => setMessage(null)} />
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-body-medium text-text-primary">{message.subject || "(sem assunto)"}</strong>
            <span className="block truncate text-caption-2-regular text-text-tertiary">{message.from} · {message.date}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="small" leadingIcon={Send} onClick={() => setCompose({ to: message.from, subject: message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`, text: `\n\n---\n${message.text}`, inReplyTo: message.subject })}>Responder</Button>
          <Button variant="ghost" size="small" leadingIcon={Trash2} onClick={() => void deleteMessage(message)}>Excluir</Button>
        </div>
        <div className="max-h-[min(52dvh,520px)] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border-button-default bg-background-secondary-default p-3 text-body-2-regular text-text-primary">
          {message.text || "(mensagem sem corpo de texto)"}
        </div>
        {message.attachments.length > 0 ? <p className="text-caption-2-regular text-text-tertiary">Anexos: {message.attachments.join(", ")}</p> : null}
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Voltar" onClick={() => { setSelected(null); setMessages(null); }} />
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-body-medium text-text-primary">{selected.name}</strong>
            <span className="block truncate text-caption-2-regular text-text-tertiary">{selected.email}</span>
          </div>
          <Button variant="ghost" size="small" iconOnly leadingIcon={RefreshCw} aria-label="Atualizar" onClick={() => void openInbox(selected)} />
          <Button variant="secondary" size="small" leadingIcon={Plus} onClick={() => setCompose({ to: "", subject: "", text: "" })}>Escrever</Button>
        </div>
        {busy === `inbox:${selected.id}` ? <LoadingState label="Abrindo caixa de entrada..." /> : null}
        {messages?.length === 0 ? <p className="py-6 text-center text-caption-1-regular text-text-secondary">Caixa de entrada vazia.</p> : null}
        <div className="flex flex-col gap-1">
          {messages?.map((item) => (
            <button key={item.uid} type="button" onClick={() => void openMessage(item)} className="flex w-full items-start gap-2 rounded-2xl border border-border-button-default p-3 text-start hover:bg-background-primary-hover">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${item.seen ? "bg-transparent" : "bg-accent-500"}`} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-caption-1-semibold text-text-primary">{item.from}</span>
                <span className="truncate text-caption-1-medium text-text-primary">{item.subject || "(sem assunto)"}</span>
                <span className="truncate text-caption-2-regular text-text-tertiary">{item.snippet}</span>
              </span>
              <span className="shrink-0 text-caption-2-regular text-text-tertiary">{item.date}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-body-2-regular text-text-secondary">Conecte caixas IMAP/SMTP para que seus Tophs possam ler, responder, enviar e limpar emails.</p>
        <Button size="small" leadingIcon={Plus} onClick={() => setAdding((value) => !value)} className="w-full justify-center sm:w-auto">{adding ? "Cancelar" : "Adicionar"}</Button>
      </div>
      {error ? <p className="rounded-xl bg-status-rose-background p-3 text-caption-1-regular text-status-rose-text">{error}</p> : null}
      {adding ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border-button-default p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Nome" value={form.name} onChange={(value) => update({ name: value })} placeholder="Email pessoal" />
            <Input label="Email" value={form.email} onChange={(value) => update({ email: value })} placeholder="voce@exemplo.com" />
          </div>
          <p className="pt-1 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">IMAP</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input label="Host" value={form.imapHost} onChange={(value) => update({ imapHost: value })} placeholder="imap.exemplo.com" />
            <Input label="Porta" value={String(form.imapPort)} onChange={(value) => update({ imapPort: Number(value) || 993 })} />
            <Select selectedKey={form.imapSecurity ?? "ssl"} onSelectionChange={(key) => update({ imapSecurity: String(key), imapTls: String(key) !== "none" })} aria-label="Segurança IMAP" className="w-full">
              <SelectItem id="ssl">SSL/TLS</SelectItem>
              <SelectItem id="starttls">STARTTLS</SelectItem>
              <SelectItem id="none">Sem TLS</SelectItem>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Usuário IMAP" value={form.imapUser} onChange={(value) => update({ imapUser: value })} placeholder={form.email || "usuario"} />
            <Input label="Senha IMAP" type="password" value={form.imapPassword} onChange={(value) => update({ imapPassword: value })} />
          </div>
          <p className="pt-1 text-caption-2-semibold uppercase tracking-wide text-text-tertiary">SMTP</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input label="Host" value={form.smtpHost} onChange={(value) => update({ smtpHost: value })} placeholder="smtp.exemplo.com" />
            <Input label="Porta" value={String(form.smtpPort)} onChange={(value) => update({ smtpPort: Number(value) || 465 })} />
            <Select selectedKey={form.smtpSecurity ?? "ssl"} onSelectionChange={(key) => update({ smtpSecurity: String(key), smtpTls: String(key) !== "none" })} aria-label="Segurança SMTP" className="w-full">
              <SelectItem id="ssl">SSL/TLS</SelectItem>
              <SelectItem id="starttls">STARTTLS</SelectItem>
              <SelectItem id="none">Sem TLS</SelectItem>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Usuário SMTP" value={form.smtpUser} onChange={(value) => update({ smtpUser: value })} placeholder={form.email || "usuario"} />
            <Input label="Senha SMTP" type="password" value={form.smtpPassword} onChange={(value) => update({ smtpPassword: value })} />
          </div>
          <Button className="w-full justify-center" disabled={busy === "create" || !form.name.trim() || !form.email.trim() || !form.imapHost.trim() || !form.smtpHost.trim()} onClick={() => void create()}>
            {busy === "create" ? "Adicionando..." : "Adicionar conta"}
          </Button>
        </div>
      ) : null}
      {accounts.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border-button-white p-6 text-center">
          <Mail className="size-6 text-accent-500" />
          <strong className="text-body-medium text-text-primary">Nenhuma conta conectada</strong>
          <p className="max-w-sm text-caption-1-regular text-text-secondary">Adicione uma conta IMAP/SMTP para liberar email para os Tophs.</p>
        </div>
      ) : null}
      {accounts.map((account) => (
        <div key={account.id} className="flex items-center gap-3 rounded-2xl border border-border-button-white bg-background-primary-default p-3">
          <Mail className="size-5 shrink-0 text-accent-500" />
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-body-2-medium text-text-primary">{account.name}</strong>
            <span className="block truncate text-caption-2-regular text-text-tertiary">{account.email}</span>
          </div>
          <Button variant="secondary" size="small" onClick={() => void openInbox(account)}>Abrir</Button>
          <Button variant="ghost" size="small" iconOnly leadingIcon={RefreshCw} aria-label="Testar conexão" onClick={() => void test(account)} />
          <Button variant="ghost" size="small" iconOnly leadingIcon={Trash2} aria-label="Remover conta" onClick={() => void remove(account)} />
        </div>
      ))}
    </div>
  );
}
