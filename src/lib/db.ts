import { Pool, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

// Ensure .env is loaded before creating the pool
dotenv.config();

console.log('🔍 DB Module - DATABASE_URL:', process.env.DATABASE_URL ? 'Loaded ✓' : 'Missing ✗');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const db = {
  query: <T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> => pool.query<T>(text, params),
};

export default db;
