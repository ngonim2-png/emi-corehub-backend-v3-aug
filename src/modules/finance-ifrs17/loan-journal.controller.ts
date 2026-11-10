import { Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LoanJournalService } from './loan-journal.service';

@Controller('finance/loan-journals')
@Roles('Super Admin', 'Supreme Admin', 'Finance Manager', 'Finance Director', 'Internal Auditor')
export class LoanJournalController {
  constructor(private readonly loanJournals: LoanJournalService) {}

  /** How many disbursed loans and repayments are not yet in the books. */
  @Get('status')
  status() {
    return this.loanJournals.status();
  }

  @Post('backfill')
  @Roles('Super Admin', 'Supreme Admin', 'Finance Manager', 'Finance Director')
  @AuditLog({ action: 'loan.journals_backfilled', entityType: 'loan' })
  backfill(@CurrentUser() actor: AuthenticatedUser) {
    return this.loanJournals.backfill(actor);
  }
}
