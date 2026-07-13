import 'dotenv/config';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { InitSchema1783692571893 } from '../../src/persistence/migrations/1783692571893-InitSchema';

/**
 * Выполняется один раз перед e2e-набором (jest globalSetup, основной процесс):
 *  1. создаёт изолированную базу `<DB_NAME>_test`, если её ещё нет;
 *  2. применяет к ней миграции;
 *  3. направляет DB_NAME на неё — env распространяется на тестовые воркеры,
 *     поэтому набор может свободно делать TRUNCATE и никогда не трогает dev-базу.
 */
export default async function globalSetup(): Promise<void> {
  const host = process.env.DB_HOST ?? 'localhost';
  const port = Number(process.env.DB_PORT ?? 5432);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const testDb = `${process.env.DB_NAME ?? 'psp_gsp'}_test`;

  const admin = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
  });
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [testDb],
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${testDb}"`);
  }
  await admin.end();

  const ds = new DataSource({
    type: 'postgres',
    host,
    port,
    username: user,
    password,
    database: testDb,
    migrations: [InitSchema1783692571893],
    namingStrategy: new SnakeNamingStrategy(),
  });
  await ds.initialize();
  await ds.runMigrations();
  await ds.destroy();

  process.env.DB_NAME = testDb;
}
