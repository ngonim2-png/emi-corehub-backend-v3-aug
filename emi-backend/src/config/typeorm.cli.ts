import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Used only by the TypeORM CLI (`npm run migration:generate` /
 * `migration:run`), never imported by the running application - the app
 * itself gets its DataSource from TypeOrmModule.forRootAsync in
 * app.module.ts, which points at this same `migrations` glob so the
 * migrations this CLI generates are the ones the app actually applies.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'emi_app',
  password: process.env.DB_PASSWORD ?? 'changeme',
  database: process.env.DB_NAME ?? 'emi_corehub',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
});
