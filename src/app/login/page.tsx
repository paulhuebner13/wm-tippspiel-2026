import LoginRegisterPanel from '@/components/LoginRegisterPanel';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';

type LoginSearchParams = {
  error?: string;
  mode?: string;
  created?: string;
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginSearchParams> }) {
  const user = await getCurrentUser();
  if (user) redirect('/matches');

  const params = await searchParams;
  const initialMode = params.mode === 'register' ? 'register' : 'login';

  return (
    <main className="loginPage">
      <LoginRegisterPanel initialMode={initialMode} error={params.error} created={params.created} />
    </main>
  );
}
