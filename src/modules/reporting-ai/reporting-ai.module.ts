import { Module } from '@nestjs/common';
import { ClientsPoliciesModule } from '../clients-policies/clients-policies.module';
import { ClaimsModule } from '../claims/claims.module';
import { FinanceIfrs17Module } from '../finance-ifrs17/finance-ifrs17.module';
import { ReportingService } from './reporting.service';
import { DashboardController, AiAssistantController, RegulatoryReportController } from './reporting.controller';
import { AI_PROVIDER } from './adapters/ai-provider.adapter';
import { AnthropicAiAdapter } from './adapters/anthropic-ai.adapter';

@Module({
  imports: [ClientsPoliciesModule, ClaimsModule, FinanceIfrs17Module],
  providers: [ReportingService, { provide: AI_PROVIDER, useClass: AnthropicAiAdapter }],
  controllers: [DashboardController, AiAssistantController, RegulatoryReportController],
  exports: [ReportingService],
})
export class ReportingAiModule {}
