/**
 * One-time bootstrap for a fresh database: roles, a Super Admin login,
 * a couple of demo marketer accounts, the product catalogue, and the
 * chart of accounts. Run with `npm run seed` after the schema exists
 * (via `synchronize: true` in development, or migrations in production).
 *
 * Safe to re-run: every insert checks for an existing row first.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { hashPassword } from './common/utils/password.util';
import { RoleEntity } from './modules/identity-access/entities/role.entity';
import { UserEntity } from './modules/identity-access/entities/user.entity';
import { ProductEntity } from './modules/clients-policies/entities/product.entity';
import { ChartOfAccountEntity } from './modules/finance-ifrs17/entities/chart-of-account.entity';

dotenv.config();

const ROLES = [
  'Supreme Admin',
  'Super Admin',
  'Finance Manager',
  'Underwriting Officer',
  'Claims Officer',
  'Branch Manager',
  'Marketer / Agent',
  'HR Manager',
  'Internal Auditor',
  'Life Manager',
  'Finance Director',
];

const PRODUCTS = [
  { code: 'SS01', name: 'Super Savings', category: 'Endowment', minPremium: 50, maxPremium: 5000 },
  { code: 'END01', name: 'Endowment', category: 'Endowment', minPremium: 50, maxPremium: 5000 },
  { code: 'CL01', name: 'Credit Life', category: 'Protection', minPremium: 20, maxPremium: 2000 },
  { code: 'PA01', name: 'Personal Accident', category: 'Protection', minPremium: 20, maxPremium: 1000 },
  { code: 'RP01', name: 'Retirement Plan', category: 'Savings', minPremium: 100, maxPremium: 5000 },
  { code: 'GL01', name: 'Group Life', category: 'Protection', minPremium: 50, maxPremium: 3000 },
];

const CHART_OF_ACCOUNTS: { code: string; name: string; type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense' }[] = [
  { code: '1000', name: 'Cash on Hand', type: 'Asset' },
  { code: '1010', name: 'Bank Account', type: 'Asset' },
  { code: '1020', name: 'Mobile Money Wallet', type: 'Asset' },
  { code: '1100', name: 'Premium Receivable', type: 'Asset' },
  { code: '1200', name: 'Marketer Cash Liability Control', type: 'Asset' },
  { code: '1300', name: 'Deferred Acquisition Cost Asset', type: 'Asset' },
  { code: '1500', name: 'Fixed Assets', type: 'Asset' },
  { code: '1600', name: 'Accumulated Depreciation', type: 'Asset' },
  { code: '2000', name: 'Insurance Contract Liability — LRC', type: 'Liability' },
  { code: '2010', name: 'Insurance Contract Liability — LIC', type: 'Liability' },
  { code: '2100', name: 'Claims Payable', type: 'Liability' },
  { code: '2200', name: 'Commission Payable', type: 'Liability' },
  { code: '2300', name: 'Marketer Token Wallet Liability', type: 'Liability' },
  { code: '2400', name: 'Accounts Payable', type: 'Liability' },
  { code: '3000', name: 'Retained Earnings', type: 'Equity' },
  { code: '3100', name: 'Share Capital / Members Fund', type: 'Equity' },
  { code: '4000', name: 'Insurance Revenue', type: 'Income' },
  { code: '4100', name: 'Investment Income', type: 'Income' },
  { code: '5000', name: 'Insurance Service Expense', type: 'Expense' },
  { code: '5100', name: 'Claims Expense', type: 'Expense' },
  { code: '5200', name: 'Commission Expense', type: 'Expense' },
  { code: '5300', name: 'Administrative Expense', type: 'Expense' },
  { code: '5400', name: 'Depreciation Expense', type: 'Expense' },
];

const DEMO_USERS = [
  { fullName: 'Supreme Admin', email: 'supreme@emi.sl', role: 'Supreme Admin' },
  { fullName: 'Super Admin', email: 'admin@emi.sl', role: 'Super Admin' },
  { fullName: 'Finance Manager', email: 'finance@emi.sl', role: 'Finance Manager' },
  { fullName: 'Abu Kamara', email: 'abu.kamara@emi.sl', role: 'Marketer / Agent' },
  { fullName: 'Mariama Conteh', email: 'mariama.conteh@emi.sl', role: 'Marketer / Agent' },
  { fullName: 'Life Manager', email: 'lifemanager@emi.sl', role: 'Life Manager' },
  { fullName: 'Finance Director', email: 'financedirector@emi.sl', role: 'Finance Director' },
];

const DEMO_PASSWORD = 'password123';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'emi_app',
    password: process.env.DB_PASSWORD ?? 'changeme',
    database: process.env.DB_NAME ?? 'emi_corehub',
    entities: [UserEntity, RoleEntity, ProductEntity, ChartOfAccountEntity],
  });
  await dataSource.initialize();
  console.log('Connected to database.');

  const roleRepo = dataSource.getRepository(RoleEntity);
  const userRepo = dataSource.getRepository(UserEntity);
  const productRepo = dataSource.getRepository(ProductEntity);
  const accountRepo = dataSource.getRepository(ChartOfAccountEntity);

  const roleByName = new Map<string, RoleEntity>();
  for (const name of ROLES) {
    let role = await roleRepo.findOne({ where: { name } });
    if (!role) {
      role = await roleRepo.save(roleRepo.create({ name }));
      console.log(`Created role: ${name}`);
    }
    roleByName.set(name, role);
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    const existing = await userRepo.findOne({ where: { email: u.email } });
    if (existing) continue;
    const role = roleByName.get(u.role);
    if (!role) throw new Error(`Role not seeded: ${u.role}`);
    await userRepo.save(
      userRepo.create({
        fullName: u.fullName,
        email: u.email,
        passwordHash,
        role,
        status: 'Active',
        mfaEnabled: false,
      }),
    );
    console.log(`Created user: ${u.email} (password: ${DEMO_PASSWORD})`);
  }

  for (const p of PRODUCTS) {
    const existing = await productRepo.findOne({ where: { code: p.code } });
    if (existing) continue;
    await productRepo.save(
      productRepo.create({
        code: p.code,
        name: p.name,
        category: p.category,
        minPremium: p.minPremium.toFixed(2),
        maxPremium: p.maxPremium.toFixed(2),
      }),
    );
    console.log(`Created product: ${p.name}`);
  }

  for (const a of CHART_OF_ACCOUNTS) {
    const existing = await accountRepo.findOne({ where: { code: a.code } });
    if (existing) continue;
    await accountRepo.save(accountRepo.create(a));
    console.log(`Created account: ${a.code} ${a.name}`);
  }

  console.log('\nSeed complete. Log in with:');
  for (const u of DEMO_USERS) console.log(`  ${u.email} / ${DEMO_PASSWORD} (${u.role})`);

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
