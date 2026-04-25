import { AppShell } from '@/components/app-shell';
import { MetricCard } from '@/components/dashboard/metric-card';
import {
  clearTelegramWebhook,
  sendTelegramBroadcast,
  setActivePaymentTemplate,
  setKillSwitch,
  syncTelegramWebhook,
  uploadSupportQrisTemplate
} from '@/app/actions/admin';
import { getAdminOverview } from '@/lib/queries/admin';
import { getViewer } from '@/lib/viewer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { BoothLocationCard } from '@/components/admin/booth-location-card';

export default async function AdminPage() {
  await requireAdmin();

  const viewer = await getViewer();
  const role = viewer.profile?.role ?? 'guest';
  const name = viewer.profile?.full_name ?? viewer.user?.email ?? 'Guest';

  let overview = {
    operators: 0,
    sessions: 0,
    overlays: 0,
    settings: { booth_kill_switch: false } as any,
    booths: [] as any[],
    paymentTemplates: [] as any[],
    telegramWebhook: null as any
  };

  let users: any[] = [];

  try {
    overview = await getAdminOverview();

    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, trial_started_at, trial_ends_at, created_at')
      .order('created_at', { ascending: false })
      .limit(12);

    users = data ?? [];
  } catch {
    // ignore
  }

  const firstBooth = overview.booths[0] ?? null;
  const defaultWebhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/webhooks/telegram`;

  return (
    <AppShell
      currentPath="/admin"
      title="Admin Control Center"
      description="Kontrol operasional, webhook Telegram, template pembayaran, lokasi booth, dan broadcast."
      role={role}
      profileName={name}
    >
      <div className="grid gap-6 md:grid-cols-3">
        <MetricCard label="Operators" value={overview.operators} />
        <MetricCard label="Sessions" value={overview.sessions} />
        <MetricCard label="Overlays" value={overview.overlays} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-600">
                Live booth monitor
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-950">
                Pantau booth secara langsung
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Gunakan preview ini untuk memantau booth dan memastikan semuanya berjalan normal.
              </p>
            </div>

            {firstBooth ? (
              <a
                href={`/booth/${firstBooth.id}`}
                target="_blank"
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
              >
                Open Full Booth
              </a>
            ) : null}
          </div>

          <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-950">
            {firstBooth ? (
              <iframe
                src={`/booth/${firstBooth.id}?monitor=1`}
                title="Booth monitor"
                className="h-[520px] w-full"
              />
            ) : (
              <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">
                Belum ada booth aktif untuk dipantau.
              </div>
            )}
          </div>

          {overview.booths.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {overview.booths.map((booth) => (
                <a
                  key={booth.id}
                  href={`/booth/${booth.id}`}
                  target="_blank"
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-brand-200 hover:bg-brand-50"
                >
                  {booth.name ?? booth.slug ?? booth.id}
                </a>
              ))}
            </div>
          ) : null}
        </section>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600">
                  Telegram bot
                </p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">
                  Webhook & bot control
                </h3>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  overview.telegramWebhook?.url
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {overview.telegramWebhook?.url ? 'Webhook Active' : 'Webhook Inactive'}
              </span>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex justify-between gap-4">
                <span>Current URL</span>
                <span className="max-w-[60%] break-all text-right text-slate-900">
                  {overview.telegramWebhook?.url ?? '-'}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span>Pending updates</span>
                <span className="font-medium text-slate-900">
                  {overview.telegramWebhook?.pending_update_count ?? 0}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span>Last error</span>
                <span className="max-w-[60%] break-all text-right text-slate-900">
                  {overview.telegramWebhook?.last_error_message ?? '-'}
                </span>
              </div>
            </div>

            <form action={syncTelegramWebhook} className="mt-4 space-y-3">
              <input
                type="text"
                name="webhookUrl"
                defaultValue={overview.telegramWebhook?.url ?? defaultWebhookUrl}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0"
                placeholder="https://domainkamu.com/api/webhooks/telegram"
              />
              <div className="flex flex-wrap gap-3">
                <button className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">
                  Set / Start Bot
                </button>
                <button
                  formAction={clearTelegramWebhook}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900"
                >
                  Clear Webhook
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-600">
                  Booth safeguard
                </p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">
                  Global booth kill switch
                </h3>
              </div>

              <form
                action={async () => {
                  'use server';
                  await setKillSwitch(!Boolean(overview.settings?.booth_kill_switch));
                }}
              >
                <button
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                    overview.settings?.booth_kill_switch
                      ? 'bg-rose-600 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {overview.settings?.booth_kill_switch ? 'Disable Booth Globally' : 'Booth Live'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>

      <BoothLocationCard booths={overview.booths} />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-600">
            Payment template
          </p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">
            Upload template QRIS support developer
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Template ini dipakai untuk menampilkan QRIS Pakasir di chat Telegram dengan desain menarik.
          </p>

          <form action={uploadSupportQrisTemplate} className="mt-5 space-y-4">
            <input
              name="label"
              required
              placeholder="Nama template"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
            <input
              name="file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              className="block w-full rounded-2xl border border-slate-200 p-3 text-sm"
            />
            <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Upload Template
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {overview.paymentTemplates.length > 0 ? (
              overview.paymentTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{template.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{template.storage_path}</p>
                  </div>

                  <form action={setActivePaymentTemplate}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <button
                      className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                        template.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-950 text-white'
                      }`}
                    >
                      {template.is_active ? 'Active' : 'Set Active'}
                    </button>
                  </form>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Belum ada template support QRIS yang diupload.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-600">
            Telegram marketing
          </p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">
            Broadcast promo / pengumuman
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Pesan akan dikirim ke chat Telegram yang pernah claim hasil foto.
          </p>

          <form action={sendTelegramBroadcast} className="mt-5 space-y-4">
            <textarea
              name="message"
              required
              rows={5}
              className="w-full rounded-[1.5rem] border border-slate-200 px-4 py-4 text-sm outline-none"
              placeholder="Tulis promo, pengumuman, atau broadcast di sini..."
            />
            <input
              type="file"
              name="image"
              accept="image/*"
              className="block w-full rounded-2xl border border-slate-200 p-3 text-sm"
            />
            <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Kirim Broadcast
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
        <h3 className="text-lg font-semibold text-slate-950">Recent Users</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-3">Name</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Trial Start</th>
                <th className="pb-3">Trial End</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="py-3">{user.full_name ?? user.id}</td>
                  <td className="py-3">{user.role}</td>
                  <td className="py-3">{user.trial_started_at ?? '-'}</td>
                  <td className="py-3">{user.trial_ends_at ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}