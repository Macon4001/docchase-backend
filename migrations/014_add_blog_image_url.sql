-- Add image_url field to blog_posts table
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add a comment to describe the field
COMMENT ON COLUMN blog_posts.image_url IS 'URL to the featured image for the blog post';
