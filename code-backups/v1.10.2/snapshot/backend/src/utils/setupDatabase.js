const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Validate database name format to prevent SQL injection
function validateDbName(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid database name: ${name}. Only alphanumeric characters and underscores allowed.`);
  }
  return name;
}

async function setupDatabase() {
  console.log('Starting PaySick Database Setup...\n');

  const dbName = validateDbName(process.env.DB_NAME || 'paysick_db');

  // First, connect to postgres database to create our database
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    // Check if database exists
    const dbCheckResult = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (dbCheckResult.rows.length === 0) {
      console.log(`Creating database: ${dbName}...`);
      // DB name validated above to be safe for interpolation
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      console.log('Database created successfully\n');
    } else {
      console.log('Database already exists\n');
    }

    await adminPool.end();

    // Now connect to our database and run schema
    const appPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: dbName,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    });

    // Run core schema
    console.log('Running database schema...');
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await appPool.query(schema);
    console.log('Schema executed successfully\n');

    // Collect migrations from both directories
    const migrationDirs = [
      path.join(__dirname, '../migrations'),
      path.join(__dirname, '../../database/migrations')
    ];

    const allMigrations = [];

    for (const dir of migrationDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
          .filter(f => f.endsWith('.sql'))
          .map(f => ({ name: f, path: path.join(dir, f) }));
        allMigrations.push(...files);
      }
    }

    // Sort migrations by filename (numeric prefix ordering)
    allMigrations.sort((a, b) => a.name.localeCompare(b.name));

    // Deduplicate by filename (prefer first occurrence)
    const seen = new Set();
    const uniqueMigrations = allMigrations.filter(m => {
      if (seen.has(m.name)) return false;
      seen.add(m.name);
      return true;
    });

    // Run migrations — check both migration directories:
    //   src/migrations/      (security tables, etc.)
    //   database/migrations/ (marketplace tables, risk scoring, Shield, etc.)
    console.log('📋 Running migrations...');
    const migrationDirs = [
      path.join(__dirname, '../migrations'),          // src/migrations
      path.join(__dirname, '../../database/migrations') // database/migrations
    ];

    // Collect all .sql files from both dirs, deduplicate by filename, sort globally
    const seenNames = new Set();
    const allMigrations = [];
    for (const dir of migrationDirs) {
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
          if (!seenNames.has(file)) {
            seenNames.add(file);
            allMigrations.push({ dir, file });
          }
        }
      }
    }
    // Sort by filename so numeric prefixes (001_, 002_…) run in order
    allMigrations.sort((a, b) => a.file.localeCompare(b.file));

    for (const { dir, file } of allMigrations) {
      try {
        console.log(`   Running ${file}...`);
        const sql = fs.readFileSync(path.join(dir, file), 'utf8');
        await appPool.query(sql);
        console.log(`   ✅ ${file} completed`);
      } catch (err) {
        // Ignore errors for "already exists" type issues
        if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
          console.warn(`   ⚠️  ${file}: ${err.message}`);
        } else {
          console.log(`   ℹ️  ${file} (already applied)`);
        }
      }
    }
    console.log('✅ Migrations completed\n');

    // Verify database connection
    const testResult = await appPool.query('SELECT NOW() as current_time');
    console.log('Database connection verified');
    console.log(`  Server time: ${testResult.rows[0].current_time}\n`);

    await appPool.end();

    console.log('Database setup completed successfully!\n');
    console.log('Start the server with: npm start\n');

  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();
