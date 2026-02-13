import { db } from '../lib/db.js';
import cron from 'node-cron';

/**
 * Checks for scheduled blog posts that are ready to publish
 * and automatically publishes them
 */
async function publishScheduledPosts(): Promise<void> {
  try {
    console.log('[Blog Scheduler] Checking for scheduled posts...');

    const result = await db.query(
      `UPDATE blog_posts
       SET published = true, updated_at = NOW()
       WHERE published = false
         AND scheduled_publish_at IS NOT NULL
         AND scheduled_publish_at <= NOW()
       RETURNING id, title, scheduled_publish_at`,
      []
    );

    if (result.rows.length > 0) {
      console.log(`[Blog Scheduler] Published ${result.rows.length} scheduled post(s):`);
      result.rows.forEach((post) => {
        console.log(`  - "${post.title}" (scheduled for ${post.scheduled_publish_at})`);
      });
    } else {
      console.log('[Blog Scheduler] No scheduled posts ready to publish');
    }
  } catch (error) {
    console.error('[Blog Scheduler] Error publishing scheduled posts:', error);
  }
}

/**
 * Starts the blog post scheduler
 * Runs every minute to check for posts ready to publish
 */
export function startBlogScheduler(): void {
  console.log('[Blog Scheduler] Starting scheduled post publisher...');
  console.log('[Blog Scheduler] Will check for scheduled posts every minute');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    await publishScheduledPosts();
  });

  // Also run immediately on startup
  publishScheduledPosts();
}
