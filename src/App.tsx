import { useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { StoreProvider, useStore } from './store/store';
import { UIProvider, useUI } from './store/ui';
import { Layout, SearchDialog } from './components/Layout';
import { AccountDialog, TransactionDialog, TransferDialog } from './components/forms';
import { Button, Card, ErrorState, Field, Input, Modal, Spinner } from './components/ui';
import { Overview } from './pages/Overview';
import { Transactions } from './pages/Transactions';
import { Expenses, Incomes } from './pages/ExpensesIncomes';
import { InvestmentDialog, InvestmentOpDialog, Investments } from './pages/Investments';
import { Budgets, Goals } from './pages/BudgetsGoals';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { createLocalRepo } from './data/localRepo';
import { createSupabaseRepo, supabase } from './data/supabase';

function Pages() {
  const { route } = useUI();
  const { ready, loadError, reload } = useStore();
  if (loadError) return <ErrorState text={loadError} onRetry={reload} />;
  if (!ready) return <Spinner label="Carregando seus dados…" />;
  switch (route.page) {
    case 'overview':
      return <Overview />;
    case 'transactions':
      return <Transactions />;
    case 'expenses':
      return <Expenses />;
    case 'incomes':
      return <Incomes />;
    case 'investments':
      return <Investments />;
    case 'budgets':
      return <Budgets />;
    case 'goals':
      return <Goals />;
    case 'reports':
      return <Reports />;
    case 'settings':
      return <Settings />;
  }
}

function Dialogs() {
  const { dialog, close } = useUI();
  const { ready } = useStore();
  if (!dialog || !ready) return null;
  switch (dialog.type) {
    case 'tx':
      return <TransactionDialog key={JSON.stringify(dialog.draft).slice(0, 200)} draft={dialog.draft} />;
    case 'transfer':
      return <TransferDialog draft={dialog.draft} />;
    case 'account':
      return <AccountDialog id={dialog.id} />;
    case 'investment':
      return <InvestmentDialog id={dialog.id} />;
    case 'invop':
      return <InvestmentOpDialog investmentId={dialog.investmentId} opId={dialog.opId} />;
    case 'search':
      return <SearchDialog />;
    case 'confirm': {
      const { opts, resolve } = dialog;
      const done = (v: boolean) => {
        resolve(v);
        close();
      };
      return (
        <Modal
          open
          onClose={() => done(false)}
          title={opts.title}
          footer={
            <>
              <Button variant="ghost" onClick={() => done(false)}>
                Cancelar
              </Button>
              <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => done(true)} autoFocus>
                {opts.confirmLabel ?? 'Confirmar'}
              </Button>
            </>
          }
        >
          {opts.text && <p className="text-sm text-ink-2">{opts.text}</p>}
        </Modal>
      );
    }
  }
}

function Shell() {
  return (
    <UIProvider>
      <Layout>
        <Pages />
      </Layout>
      <Dialogs />
    </UIProvider>
  );
}

/** Modo Supabase: exige login; cada usuário só acessa os próprios dados (RLS). */
function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const repo = useMemo(() => (session ? createSupabaseRepo(supabase!, session.user.id) : null), [session?.user.id]);
  if (session === undefined) return <Spinner />;
  if (!session || !repo) return <Login />;
  return (
    <StoreProvider key={session.user.id} repo={repo} userEmail={session.user.email ?? null} signOut={async () => void (await supabase!.auth.signOut())}>
      <Shell />
    </StoreProvider>
  );
}

/** URL base do app (inclui o caminho do repositório no GitHub Pages). */
const appUrl = () => window.location.origin + window.location.pathname;

function Login() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'error' | 'ok'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ type: 'error', text: 'Informe um e-mail válido.' });
    if (mode !== 'reset' && password.length < 8) return setMsg({ type: 'error', text: 'A senha deve ter pelo menos 8 caracteres.' });
    setLoading(true);
    const sb = supabase!;
    const res =
      mode === 'signin'
        ? await sb.auth.signInWithPassword({ email, password })
        : mode === 'signup'
          ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } })
          : await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    setLoading(false);
    if (res.error) {
      const m = res.error.message;
      setMsg({ type: 'error', text: /invalid login/i.test(m) ? 'E-mail ou senha incorretos.' : /fetch/i.test(m) ? 'Sem conexão com o servidor.' : m });
    } else if (mode === 'signup') setMsg({ type: 'ok', text: 'Conta criada. Verifique seu e-mail para confirmar o cadastro, se solicitado.' });
    else if (mode === 'reset') setMsg({ type: 'ok', text: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.' });
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
            <Wallet className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Finanças Pessoais</h1>
            <p className="text-xs text-ink-3">{mode === 'signin' ? 'Entre para acessar seus dados' : mode === 'signup' ? 'Crie sua conta' : 'Recuperar senha'}</p>
          </div>
        </div>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="E-mail">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          {mode !== 'reset' && (
            <Field label="Senha">
              <Input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          {msg && <p className={`text-[13px] ${msg.type === 'error' ? 'text-neg' : 'text-pos'}`}>{msg.text}</p>}
          <Button variant="primary" type="submit" loading={loading}>
            {mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
          </Button>
        </form>
        <div className="mt-4 flex justify-between text-[13px]">
          <button className="text-accent hover:underline" onClick={() => (setMode(mode === 'signin' ? 'signup' : 'signin'), setMsg(null))}>
            {mode === 'signin' ? 'Criar conta' : 'Já tenho conta'}
          </button>
          {mode === 'signin' && (
            <button className="text-ink-3 hover:underline" onClick={() => (setMode('reset'), setMsg(null))}>
              Esqueci a senha
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const localRepo = useMemo(() => (supabase ? null : createLocalRepo()), []);
  if (supabase) return <AuthGate />;
  return (
    <StoreProvider repo={localRepo!}>
      <Shell />
    </StoreProvider>
  );
}
