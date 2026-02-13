-- Add scheduled publishing support to blog_posts
ALTER TABLE blog_posts
ADD COLUMN scheduled_publish_at TIMESTAMP;

-- Create index on scheduled_publish_at for efficient lookups
CREATE INDEX idx_blog_posts_scheduled ON blog_posts(scheduled_publish_at)
WHERE scheduled_publish_at IS NOT NULL AND published = false;

-- Add comment to explain the column
COMMENT ON COLUMN blog_posts.scheduled_publish_at IS 'When set and published=false, post will auto-publish at this time';
