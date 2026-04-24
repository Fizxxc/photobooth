import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export function buildUserBucketId(userId: string) {
  return `user-${userId}`;
}

export async function ensureUserBucket(userId: string) {
  const bucketId = buildUserBucketId(userId);
  const admin = createSupabaseAdminClient();
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.id === bucketId);
  if (!exists) {
    const { error } = await admin.storage.createBucket(bucketId, {
      public: false,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      fileSizeLimit: '20MB'
    });
    if (error) throw error;
  }
  return bucketId;
}
