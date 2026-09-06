import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://eonx:eonx_secret@localhost:5432/codebase_knowledge",
});

export default pool;
