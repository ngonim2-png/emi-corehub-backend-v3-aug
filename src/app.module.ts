import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';
import { RedisModule } from './common/redis/redis.module';
import { buildRedisConnectionOptions } from './common/redis/redis-connection.util';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

import { AuditModule } from './modules/audit/audit.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { ClientsPoliciesModule } from './modules/clients-policies/clients-policies.module';
import { FieldCollectionWalletModule } from './modules/field-collection-wallet/field-collection-wallet.module';
import { UnderwritingModule } from './modules/underwriting/underwriting.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { FinanceIfrs17Module } from './modules/finance-ifrs17/finance-ifrs17.module';
import { CrmModule } from './modules/crm/crm.module';
import { MarketingSalesModule } from './modules/marketing-sales/marketing-sales.module';
import { HrModule } from './modules/hr/hr.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportingAiModule } from './modules/reporting-ai/reporting-ai.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { SettingsModule } from './modules/settings/settings.module';
import { BranchesModule } from './modules/branches/branches.module';
import { MarketingAutomationModule } from './modules/marketing-automation/marketing-automation.module';
import { RegulatoryFormsModule } from './modules/regulatory-forms/regulatory-forms.module';
import { PayrollUploadModule } from './modules/payroll-upload/payroll-upload.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { LeadershipModule } from './modules/leadership/leadership.module';
import { ClientPortalModule } from './modules/client-portal/client-portal.module';
import { PolicyDocumentsModule } from './modules/policy-documents/policy-documents.module';
import { RosterImportModule } from './modules/roster-import/roster-import.module';
import { DeductionImportModule } from './modules/deduction-import/deduction-import.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('database.url');
        const isProd = config.get<string>('nodeEnv') === 'production';
        const base = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          // Production applies committed migrations on boot instead of
          // synchronize - see src/migrations/ and DEPLOYMENT.md. This is
          // idempotent (already-applied migrations are skipped), so it's
          // safe to run on every restart of a single instance.
          synchronize: !isProd && config.get<string>('nodeEnv') === 'development',
          migrationsRun: isProd,
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
        };
        if (url) {
          // Most managed Postgres providers (Render, Railway, etc.)
          // require SSL and don't hand you a verifiable CA chain by
          // default - rejectUnauthorized:false is the common pragmatic
          // setting for these; swap in a real CA cert if the provider
          // supplies one.
          return { ...base, url, ssl: { rejectUnauthorized: false } };
        }
        return {
          ...base,
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.name'),
        };
      },
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: buildRedisConnectionOptions(
          config.get<string>('redis.url'),
          config.get<string>('redis.host'),
          config.get<number>('redis.port'),
        ),
      }),
    }),

    EventEmitterModule.forRoot(),
    RedisModule,

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    // Cross-cutting / platform
    AuditModule,
    IdentityAccessModule,

    // Phase 1
    ClientsPoliciesModule,
    FieldCollectionWalletModule,
    NotificationsModule,

    // Phase 2
    UnderwritingModule,
    ClaimsModule,
    CrmModule,

    // Phase 3
    FinanceIfrs17Module,
    HrModule,
    AdministrationModule,
    DocumentsModule,

    // Phase 4
    MarketingSalesModule,
    ReportingAiModule,
    DirectoryModule,
    SettingsModule,
    BranchesModule,
    MarketingAutomationModule,
    RegulatoryFormsModule,
    PayrollUploadModule,
    CalendarModule,
    LeadershipModule,
    ClientPortalModule,
    PolicyDocumentsModule,
    RosterImportModule,
    DeductionImportModule,

    // Background jobs (spans all phases)
    JobsModule,
  ],
  providers: [
    // Every request is authenticated by default; @Public() opts a route out.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Role checks run after authentication; @Roles() opts a route in.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Rate limiting (120 req/min/IP, see ThrottlerModule.forRoot above) -
    // configuring the module alone does nothing without this guard
    // actually registered; that gap existed for a while before being
    // caught here.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every @AuditLog()-tagged route gets an audit_logs row automatically.
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
