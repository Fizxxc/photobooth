import Link from 'next/link';
import { Camera, LayoutDashboard, Settings, Shield, UserCircle, Wallet } from 'lucide-react';
import { ProfileMenu } from '@/components/profile-menu';

export function AppShell({
  title,
  description,
  children,
  currentPath,
  role = 'guest',
  profileName = 'Guest'
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  currentPath: string;
  role?: string;
  profileName?: string;
}) {
  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: role !== 'guest' },
    { href: '/booth', label: 'Booth', icon: Camera, show: role !== 'guest' },
    { href: '/profile', label: 'Profile', icon: UserCircle, show: role !== 'guest' },
    { href: '/settings', label: 'Settings', icon: Settings, show: role !== 'guest' },
    { href: '/pricing', label: 'Pricing', icon: Wallet, show: true },
    { href: '/admin', label: 'Admin', icon: Shield, show: role === 'admin' }
  ];

  return (
    <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[250px_1fr]">
      <aside className="rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-panel backdrop-blur">
        <div>
          <img src="/logo.png" alt="KoGraph Studio" className="h-12 w-12 rounded-2xl" />
          <h1 className="mt-4 text-2xl font-bold text-slate-950">KoGraph Studio</h1>
          <p className="mt-2 text-sm text-slate-500">Immersive photobooth SaaS</p>
        </div>
        <nav className="mt-8 space-y-2">
          {nav.filter((item) => item.show).map((item) => {
            const Icon = item.icon;
            const active = currentPath.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="space-y-6">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-950">{title}</h2>
            <p className="mt-2 text-slate-600">{description}</p>
          </div>
          <ProfileMenu name={profileName} role={role} />
        </header>
        {children}
      </main>
    </div>
  );
}
