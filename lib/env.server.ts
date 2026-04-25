import { z } from 'zod';

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  PAKASIR_PROJECT_SLUG: z.string().optional(),
  PAKASIR_API_KEY: z.string().optional(),
  PAKASIR_BASE_URL: z.string().default('https://app.pakasir.com'),
  PAKASIR_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAKASIR_PLATFORM_FEE: z.coerce.number().int().nonnegative().default(1000),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  SUPPORT_DEVELOPER_DEFAULT_AMOUNT: z.coerce.number().int().positive().default(1000)
});

export function getServerEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PAKASIR_PROJECT_SLUG: process.env.PAKASIR_PROJECT_SLUG,
    PAKASIR_API_KEY: process.env.PAKASIR_API_KEY,
    PAKASIR_BASE_URL: process.env.PAKASIR_BASE_URL ?? 'https://app.pakasir.com',
    PAKASIR_MODE: process.env.PAKASIR_MODE ?? 'sandbox',
    PAKASIR_PLATFORM_FEE: process.env.PAKASIR_PLATFORM_FEE ?? '1000',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    SUPPORT_DEVELOPER_DEFAULT_AMOUNT: process.env.SUPPORT_DEVELOPER_DEFAULT_AMOUNT ?? '1000'
  });
}

export function requireServerEnv(keys: Array<keyof ReturnType<typeof getServerEnv>>) {
  const env = getServerEnv();

  for (const key of keys) {
    if (!env[key]) {
      throw new Error(`Missing required server env: ${key}`);
    }
  }

  return env;
}