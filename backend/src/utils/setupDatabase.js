const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  console.log('🚀 Starting PaySick Database Setup...\n');

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
      [process.env.DB_NAME || 'paysick_db']
    );

    if (dbCheckResult.rows.length === 0) {
      console.log(`📦 Creating database: ${process.env.DB_NAME || 'paysick_db'}...`);
      await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME || 'paysick_db'}`);
      console.log('✅ Database created successfully\n');
    } else {
      console.log('ℹ️  Database already exists\n');
    }

    await adminPool.end();

    // Now connect to our database and run schema
    const appPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'paysick_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    });

    console.log('📋 Running database schema...');
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    await appPool.query(schema);
    console.log('✅ Schema executed successfully\n');

    // Insert sample data
    console.log('📝 Inserting sample providers...');
    await appPool.query(`
      INSERT INTO providers (provider_name, provider_type, provider_group, contact_email, contact_phone, city, province, network_partner, partnership_tier, commission_rate)
      VALUES
        ('Netcare Milpark Hospital', 'hospital', 'Netcare', 'milpark@netcare.co.za', '0118001500', 'Johannesburg', 'Gauteng', true, 'platinum', 5.00),
        ('Life Healthcare Fourways', 'hospital', 'Life Healthcare', 'fourways@lifehealthcare.co.za', '0116771000', 'Johannesburg', 'Gauteng', true, 'gold', 5.50),
        ('Mediclinic Cape Town', 'hospital', 'Mediclinic', 'capetown@mediclinic.co.za', '0214644911', 'Cape Town', 'Western Cape', true, 'platinum', 5.00),
        ('Cape Town Dental Studio', 'clinic', 'Independent', 'info@ctdentalstudio.co.za', '0214651234', 'Cape Town', 'Western Cape', true, 'silver', 6.00),
        ('Spec-Savers Optometrists', 'clinic', 'Spec-Savers', 'info@specsavers.co.za', '0800022020', 'Johannesburg', 'Gauteng', true, 'gold', 5.50)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Sample providers added\n');

    // Test connection
    const testResult = await appPool.query('SELECT NOW() as current_time');
    console.log('🔗 Database connection test successful!');
    console.log(`   Current time: ${testResult.rows[0].current_time}\n`);

    await appPool.end();

    console.log('✨ Database setup completed successfully!\n');
    console.log('You can now start the server with: npm start\n');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();
