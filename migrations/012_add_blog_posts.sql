-- Create blog_posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_id UUID NOT NULL REFERENCES accountants(id) ON DELETE CASCADE,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on slug for faster lookups
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);

-- Create index on published status for filtering
CREATE INDEX idx_blog_posts_published ON blog_posts(published);

-- Create index on created_at for ordering
CREATE INDEX idx_blog_posts_created_at ON blog_posts(created_at DESC);
