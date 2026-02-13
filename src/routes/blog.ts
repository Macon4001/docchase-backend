import express, { Response, Request } from 'express';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = express.Router();

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  author_id: string;
  published: boolean;
  created_at: Date;
  updated_at: Date;
  author_name?: string;
  author_email?: string;
}

// GET /api/blog - Get all published blog posts (public)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.query<BlogPost>(
      `SELECT
        bp.*,
        a.practice_name as author_name,
        a.email as author_email
      FROM blog_posts bp
      JOIN accountants a ON bp.author_id = a.id
      WHERE bp.published = true
      ORDER BY bp.created_at DESC`,
      []
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// GET /api/blog/admin - Get all blog posts including drafts (admin only)
router.get('/admin', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.query<BlogPost>(
      `SELECT
        bp.*,
        a.practice_name as author_name,
        a.email as author_email
      FROM blog_posts bp
      JOIN accountants a ON bp.author_id = a.id
      ORDER BY bp.created_at DESC`,
      []
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// GET /api/blog/:slug - Get single blog post by slug (public if published)
router.get('/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;

    const result = await db.query<BlogPost>(
      `SELECT
        bp.*,
        a.practice_name as author_name,
        a.email as author_email
      FROM blog_posts bp
      JOIN accountants a ON bp.author_id = a.id
      WHERE bp.slug = $1 AND bp.published = true`,
      [slug]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Blog post not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// POST /api/blog - Create new blog post (admin only)
router.post('/', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const { title, slug, content, excerpt, published } = req.body;

    if (!title || !slug || !content) {
      res.status(400).json({ error: 'Title, slug, and content are required' });
      return;
    }

    // Check if slug already exists
    const existingPost = await db.query(
      'SELECT id FROM blog_posts WHERE slug = $1',
      [slug]
    );

    if (existingPost.rows[0]) {
      res.status(409).json({ error: 'A blog post with this slug already exists' });
      return;
    }

    const result = await db.query<BlogPost>(
      `INSERT INTO blog_posts (title, slug, content, excerpt, author_id, published)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, slug, content, excerpt || null, authenticatedReq.accountant.id, published || false]
    );

    console.log(`[Blog] Post created: "${title}" by ${authenticatedReq.accountant.email}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

// PUT /api/blog/:id - Update blog post (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, slug, content, excerpt, published } = req.body;

    if (!title || !slug || !content) {
      res.status(400).json({ error: 'Title, slug, and content are required' });
      return;
    }

    // Check if slug is taken by another post
    const existingPost = await db.query(
      'SELECT id FROM blog_posts WHERE slug = $1 AND id != $2',
      [slug, id]
    );

    if (existingPost.rows[0]) {
      res.status(409).json({ error: 'A blog post with this slug already exists' });
      return;
    }

    const result = await db.query<BlogPost>(
      `UPDATE blog_posts
       SET title = $1, slug = $2, content = $3, excerpt = $4, published = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title, slug, content, excerpt || null, published || false, id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Blog post not found' });
      return;
    }

    console.log(`[Blog] Post updated: "${title}"`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

// DELETE /api/blog/:id - Delete blog post (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM blog_posts WHERE id = $1 RETURNING title',
      [id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Blog post not found' });
      return;
    }

    console.log(`[Blog] Post deleted: "${result.rows[0].title}"`);
    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

export default router;
