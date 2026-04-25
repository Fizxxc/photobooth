export function formatIdr(value: number) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;
}

export function renderDonationProgressBar(current: number, target: number, size = 12) {
  const safeTarget = Math.max(target, 1);
  const ratio = Math.max(0, Math.min(current / safeTarget, 1));
  const filled = Math.round(ratio * size);
  const empty = size - filled;

  const filledBar = '🟥'.repeat(filled);
  const emptyBar = '⬜'.repeat(empty);
  const percent = Math.round(ratio * 100);

  return `${filledBar}${emptyBar} ${percent}%`;
}

export function buildDonationSummaryText(input: {
  title: string;
  current: number;
  target: number;
  charityPercent: number;
}) {
  const { title, current, target, charityPercent } = input;

  return [
    `💖 *${title}*`,
    '',
    renderDonationProgressBar(current, target),
    `${formatIdr(current)} / ${formatIdr(target)}`,
    '',
    `Sebagian dana (${charityPercent}%) akan disalurkan kepada yang membutuhkan.`,
  ].join('\n');
}