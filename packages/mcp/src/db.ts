import pg from 'pg';

const { Pool } = pg;

export interface DBProperty {
  id: string;
  site_id: string;
  name: string;
  api_base: string;
  auth_type: string;
  auth_token: string | null;
  allow_agent_access: boolean;
}

export interface DBTool {
  id: number;
  property_id: string;
  name: string;
  description: string;
  method: string;
  path: string;
  parameters: any;
  response_schema: any | null;
  response_mapping: any | null;
}

// Module-level pool — created once, reused for the lifetime of the stdio process.
// Falls back to null until first use so startup errors don't crash before main() runs.
let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (_pool) return _pool;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not defined');
  }

  _pool = new Pool({
    connectionString: dbUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: {
      // Enforce TLS certificate validation.
      // Set PGSSLROOTCERT or NODE_EXTRA_CA_CERTS if using a self-signed cert.
      rejectUnauthorized: true,
    },
  });

  _pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });

  return _pool;
}

export async function fetchPropertyAndTools(propertyId: string): Promise<{ property: DBProperty; tools: DBTool[] }> {
  const pool = getPool();

  const propRes = await pool.query(
    'SELECT id, site_id, name, api_base, auth_type, auth_token, allow_agent_access FROM developer_properties WHERE id = $1',
    [propertyId]
  );

  if (propRes.rows.length === 0) {
    throw new Error(`Property config with ID "${propertyId}" not found in database`);
  }

  const toolsRes = await pool.query(
    'SELECT id, property_id, name, description, method, path, parameters, response_schema, response_mapping FROM developer_tools WHERE property_id = $1',
    [propertyId]
  );

  return {
    property: propRes.rows[0] as DBProperty,
    tools: toolsRes.rows as DBTool[],
  };
}

/** Gracefully drain the pool — call on process exit. */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
