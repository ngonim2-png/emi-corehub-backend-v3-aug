import {
  BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AppAuthService, AppAuthContext } from './app-auth.service';
import { AppAuthGuard, AppAuth, CurrentApp } from './app-auth.guard';
import { AppClientService, CLAIM_TYPES, REQUEST_TYPES, MAX_FILE_BYTES, UploadedAppFile } from './app-client.service';
import { AppApplicationsService } from './app-applications.service';
import { AppStatementService } from './app-statement.service';
import { AppPushService } from './app-push.service';
import { AppAdminService } from './app-admin.service';
import {
  ActivateCompleteDto, ActivateDirectDto, ActivateStartDto, AppLoginDto, ApplicantLoginDto, ApplicantRegisterDto, BulkPushDto, ChangePinDto,
  ConvertApplicationDto, HandleRequestDto, IssueCodeDto, LoanRequestDto, PushSubscribeDto, PushUnsubscribeDto,
  RejectApplicationDto, RequestDto, ResetApplicantPinDto, UpdateAppProductDto,
} from './dto/app.dto';

const upload = { storage: memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 10 } };

/** Everything a person can reach before logging in. */
@Controller('app')
@Public()
export class AppPublicController {
  constructor(
    private readonly auth: AppAuthService,
    private readonly applications: AppApplicationsService,
    private readonly push: AppPushService,
    private readonly config: ConfigService,
  ) {}

  @Get('config')
  getConfig() {
    return {
      officePhone: this.config.get<string>('clientApp.officePhone') || null,
      officeWhatsapp: this.config.get<string>('clientApp.officeWhatsapp') || null,
      officeAddress: this.config.get<string>('clientApp.officeAddress') || null,
      vapidPublicKey: this.push.publicKey || null,
      claimTypes: CLAIM_TYPES,
      requestTypes: REQUEST_TYPES,
    };
  }

  @Get('products')
  products() {
    return this.applications.listProducts();
  }

  @Post('auth/activate/direct')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  activateDirect(@Body() dto: ActivateDirectDto) {
    return this.auth.activateDirect(dto.policyNo, dto.phone, dto.pin, dto.pinConfirm);
  }

  @Post('auth/activate/start')
  @Throttle({ default: { limit: 6, ttl: 600_000 } })
  activateStart(@Body() dto: ActivateStartDto) {
    return this.auth.startActivation(dto.policyNo, dto.phone);
  }

  @Post('auth/activate/complete')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  activateComplete(@Body() dto: ActivateCompleteDto) {
    return this.auth.completeActivation(dto.policyNo, dto.code, dto.pin);
  }

  @Post('auth/login')
  @Throttle({ default: { limit: 15, ttl: 300_000 } })
  login(@Body() dto: AppLoginDto) {
    return this.auth.login(dto.policyNo, dto.pin);
  }

  @Post('auth/applicant/register')
  @Throttle({ default: { limit: 6, ttl: 600_000 } })
  register(@Body() dto: ApplicantRegisterDto) {
    return this.auth.registerApplicant(dto.fullName, dto.phone, dto.pin);
  }

  @Post('auth/applicant/login')
  @Throttle({ default: { limit: 15, ttl: 300_000 } })
  applicantLogin(@Body() dto: ApplicantLoginDto) {
    return this.auth.applicantLogin(dto.phone, dto.pin);
  }
}

/** Available to both clients and applicants: the inbox and push subscriptions. */
@Controller('app')
@Public()
@UseGuards(AppAuthGuard)
@AppAuth('any')
export class AppSharedController {
  constructor(private readonly push: AppPushService) {}

  @Get('notifications')
  async inbox(@CurrentApp() who: AppAuthContext) {
    return this.push.listInbox(who.type, who.id);
  }

  @Post('notifications/read')
  async markRead(@CurrentApp() who: AppAuthContext) {
    await this.push.markAllRead(who.type, who.id);
    return { ok: true };
  }

  @Post('push/subscribe')
  async subscribe(@CurrentApp() who: AppAuthContext, @Body() dto: PushSubscribeDto) {
    await this.push.subscribe(who.type, who.id, dto);
    return { ok: true };
  }

  @Post('push/unsubscribe')
  async unsubscribe(@Body() dto: PushUnsubscribeDto) {
    await this.push.unsubscribe(dto.endpoint);
    return { ok: true };
  }
}

@Controller('app')
@Public()
@UseGuards(AppAuthGuard)
@AppAuth('client')
export class AppClientController {
  constructor(
    private readonly clientService: AppClientService,
    private readonly statements: AppStatementService,
    private readonly auth: AppAuthService,
  ) {}

  @Get('me')
  me(@CurrentApp() who: AppAuthContext) {
    return this.clientService.overview(who.id);
  }

  @Get('policies/:policyNo')
  policy(@CurrentApp() who: AppAuthContext, @Param('policyNo') policyNo: string) {
    return this.clientService.policyDetail(who.id, policyNo);
  }

  @Get('policies/:policyNo/statement')
  async statement(@CurrentApp() who: AppAuthContext, @Param('policyNo') policyNo: string, @Res() res: Response) {
    const { view, client } = await this.clientService.policyForStatement(who.id, policyNo);
    const pdf = await this.statements.build({ fullName: client.fullName, clientNo: client.clientNo }, view);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-${view.policyNo.replace(/[^\w-]/g, '')}.pdf"`,
      'Cache-Control': 'no-store',
    });
    res.send(pdf);
  }

  @Get('claims')
  claims(@CurrentApp() who: AppAuthContext) {
    return this.clientService.listClaims(who.id);
  }

  @Post('claims')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(FilesInterceptor('files', 8, upload))
  createClaim(@CurrentApp() who: AppAuthContext, @Body() body: Record<string, any>, @UploadedFiles() files: UploadedAppFile[]) {
    return this.clientService.createClaim(
      who.id,
      { policyNo: body.policyNo, claimType: body.claimType, description: body.description, incidentDate: body.incidentDate || undefined, amountClaimed: body.amountClaimed ? Number(body.amountClaimed) : 0 },
      files ?? [],
    );
  }

  @Get('loans')
  loans(@CurrentApp() who: AppAuthContext) {
    return this.clientService.listLoans(who.id);
  }

  @Post('loans')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  requestLoan(@CurrentApp() who: AppAuthContext, @Body() dto: LoanRequestDto) {
    return this.clientService.requestLoan(who.id, dto);
  }

  @Get('requests')
  requests(@CurrentApp() who: AppAuthContext) {
    return this.clientService.listRequests(who.id);
  }

  @Post('requests')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  createRequest(@CurrentApp() who: AppAuthContext, @Body() dto: RequestDto) {
    return this.clientService.createRequest(who.id, dto);
  }

  @Post('auth/change-pin')
  @Throttle({ default: { limit: 8, ttl: 600_000 } })
  changePin(@CurrentApp() who: AppAuthContext, @Body() dto: ChangePinDto) {
    return this.auth.changePin(who.id, dto.oldPin, dto.newPin);
  }
}

@Controller('app/applicant')
@Public()
@UseGuards(AppAuthGuard)
@AppAuth('applicant')
export class AppApplicantController {
  constructor(private readonly applications: AppApplicationsService) {}

  @Get('applications')
  mine(@CurrentApp() who: AppAuthContext) {
    return this.applications.listMine(who.id);
  }

  @Post('applications')
  @Throttle({ default: { limit: 8, ttl: 3_600_000 } })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'passport', maxCount: 1 }, { name: 'idDoc', maxCount: 1 }], upload))
  async submit(
    @CurrentApp() who: AppAuthContext,
    @Body() body: Record<string, any>,
    @UploadedFiles() files: { passport?: UploadedAppFile[]; idDoc?: UploadedAppFile[] },
  ) {
    let payload: any;
    try {
      payload = JSON.parse(body.payload ?? '{}');
    } catch {
      throw new BadRequestException('The application could not be read. Please try again.');
    }
    return this.applications.submit(
      who.id,
      {
        productId: payload.productId, premiumAmount: Number(payload.premiumAmount), durationYears: payload.durationYears,
        commencementDate: payload.commencementDate || undefined, isCivilServant: !!payload.isCivilServant, payrollPin: payload.payrollPin, form: payload.form ?? {},
      },
      { passport: files?.passport?.[0], idDoc: files?.idDoc?.[0] },
    );
  }
}

/** Staff-side management of the client app. Sits behind the normal staff login. */
@Controller('app-admin')
export class AppAdminController {
  constructor(
    private readonly applications: AppApplicationsService,
    private readonly admin: AppAdminService,
    private readonly auth: AppAuthService,
  ) {}

  @Get('summary')
  @Roles('Supreme Admin', 'Super Admin', 'Underwriting Officer')
  summary() {
    return this.admin.summary();
  }

  @Get('applications')
  @Roles('Supreme Admin', 'Super Admin')
  listApplications(@Query('status') status?: string) {
    return this.applications.adminList(status);
  }

  @Get('applications/:id')
  @Roles('Supreme Admin', 'Super Admin')
  application(@Param('id') id: string) {
    return this.applications.adminDetail(id);
  }

  @Get('files/:fileId')
  @Roles('Supreme Admin', 'Super Admin', 'Claims Officer', 'Underwriting Officer')
  async file(@Param('fileId') fileId: string, @Res() res: Response) {
    const f = await this.applications.getFile(fileId);
    res.set({ 'Content-Type': f.mimeType, 'Content-Disposition': `inline; filename="${f.filename.replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, max-age=300' });
    res.send(f.data);
  }

  @Get('claims/:claimId/documents')
  @Roles('Supreme Admin', 'Super Admin', 'Claims Officer', 'Underwriting Officer')
  claimDocuments(@Param('claimId') claimId: string) {
    return this.applications.listFilesFor('claim', claimId);
  }

  @Post('applications/:id/under-review')
  @Roles('Supreme Admin', 'Super Admin')
  @AuditLog({ action: 'app.application.review', entityType: 'app_application' })
  underReview(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.applications.markUnderReview(id, actor.id);
  }

  @Post('applications/:id/reject')
  @Roles('Supreme Admin', 'Super Admin')
  @AuditLog({ action: 'app.application.reject', entityType: 'app_application' })
  reject(@Param('id') id: string, @Body() dto: RejectApplicationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.applications.reject(id, dto.reason, actor.id);
  }

  @Post('applications/:id/convert')
  @Roles('Supreme Admin', 'Super Admin')
  @AuditLog({ action: 'app.application.convert', entityType: 'app_application' })
  convert(@Param('id') id: string, @Body() dto: ConvertApplicationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.applications.convert(id, actor.id, dto);
  }

  @Post('applicants/:id/reset-pin')
  @Roles('Supreme Admin', 'Super Admin')
  @AuditLog({ action: 'app.applicant.reset_pin', entityType: 'app_applicant' })
  async resetApplicantPin(@Param('id') id: string, @Body() dto: ResetApplicantPinDto) {
    await this.auth.resetApplicantPin(id, dto.newPin);
    return { ok: true };
  }

  @Post('activation-codes')
  @Roles('Supreme Admin', 'Super Admin', 'Underwriting Officer')
  @AuditLog({ action: 'app.activation_code.issue', entityType: 'client' })
  issueCode(@Body() dto: IssueCodeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.auth.issueStaffCode(dto.policyNo, actor.id);
  }

  @Get('requests')
  @Roles('Supreme Admin', 'Super Admin', 'Underwriting Officer')
  requests(@Query('status') status?: string) {
    return this.admin.listRequests(status);
  }

  @Post('requests/:id/handle')
  @Roles('Supreme Admin', 'Super Admin', 'Underwriting Officer')
  @AuditLog({ action: 'app.request.handle', entityType: 'app_request' })
  handleRequest(@Param('id') id: string, @Body() dto: HandleRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.handleRequest(id, actor.id, dto.note ?? '');
  }

  @Get('products')
  @Roles('Supreme Admin', 'Super Admin')
  products() {
    return this.admin.listProducts();
  }

  @Post('products/:id')
  @Roles('Supreme Admin', 'Super Admin')
  @AuditLog({ action: 'app.product.update', entityType: 'product' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateAppProductDto) {
    return this.admin.updateProduct(id, dto);
  }

  @Get('push/preview')
  @Roles('Supreme Admin', 'Super Admin')
  preview(@Query('segment') segment: 'all' | 'pendingPremium' | 'lapsed' | 'renewal') {
    if (!['all', 'pendingPremium', 'lapsed', 'renewal'].includes(segment)) throw new BadRequestException('Unknown audience.');
    return this.admin.previewSegment(segment);
  }

  @Post('push/send')
  @Roles('Supreme Admin', 'Super Admin')
  @AuditLog({ action: 'app.push.bulk', entityType: 'app_push' })
  send(@Body() dto: BulkPushDto) {
    return this.admin.sendBulk(dto);
  }
}
