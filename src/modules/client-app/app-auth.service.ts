import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MoreThan, Repository } from 'typeorm';
import { createHash, randomInt } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { ClientAppAccountEntity } from './entities/client-app-account.entity';
import { AppApplicantEntity } from './entities/app-applicant.entity';
import { AppVerificationCodeEntity } from './entities/app-verification-code.entity';

const SESSION_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const CODE_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 3;
const MAX_DIRECT_FAILS = 5;

export interface AppAuthContext {
  type: 'client' | 'applicant';
  id: string;
}

/** Same normalization used everywhere else policy numbers are compared: whitespace and case only, so "ssp 037" finds "SSP037". */
export function normalizePolicyNoForLookup(v: string): string {
  // Also strips leading zeros from the trailing number ("SSP037" == "SSP37"), matching the office's bulk-import matching.
  return (v ?? '').replace(/\s+/g, '').toUpperCase().replace(/(\D)0+(\d+)$/, '$1$2');
}

export function normalizePhone(v: string): string {
  let d = (v ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  // Sierra Leone: +232 country code, local numbers are 8 digits and may start with 0 (e.g. 076 123 456 / 076123456).
  if (d.startsWith('232') && d.length > 8) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

export function validatePin(pin: string): void {
  if (!/^\d{4,6}$/.test(pin ?? '')) throw new BadRequestException('Your PIN must be 4 to 6 digits.');
  if (/^(\d)\1+$/.test(pin)) throw new BadRequestException('That PIN is too easy to guess. Please avoid repeating one digit.');
  const seq = '0123456789';
  const rev = '9876543210';
  if (seq.includes(pin) || rev.includes(pin)) throw new BadRequestException('That PIN is too easy to guess. Please avoid running numbers like 1234.');
}

function sha(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class AppAuthService {
  constructor(
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(PaymentEntity) private readonly paymentsRepo: Repository<PaymentEntity>,
    @InjectRepository(ClientAppAccountEntity) private readonly accountsRepo: Repository<ClientAppAccountEntity>,
    @InjectRepository(AppApplicantEntity) private readonly applicantsRepo: Repository<AppApplicantEntity>,
    @InjectRepository(AppVerificationCodeEntity) private readonly codesRepo: Repository<AppVerificationCodeEntity>,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------- tokens

  private secret(): string {
    const s = this.config.get<string>('portalJwtSecret');
    if (!s) throw new UnauthorizedException('The client app is not configured on this server yet.');
    return s;
  }

  private sign(type: 'client' | 'applicant', id: string, tv: number): string {
    return jwt.sign({ sub: id, type, tv }, this.secret(), { expiresIn: `${SESSION_DAYS}d` });
  }

  /** Verifies signature AND that the account still exists and its PIN hasn't been changed since the token was issued. */
  async verifyToken(token: string): Promise<AppAuthContext> {
    let payload: { sub: string; type: string; tv: number };
    try {
      payload = jwt.verify(token, this.secret()) as any;
    } catch {
      throw new UnauthorizedException('Your session has expired. Please log in again.');
    }
    if (payload.type === 'client') {
      const acc = await this.accountsRepo.findOne({ where: { clientId: payload.sub } });
      if (!acc || acc.tokenVersion !== payload.tv) throw new UnauthorizedException('Your session has expired. Please log in again.');
      return { type: 'client', id: payload.sub };
    }
    if (payload.type === 'applicant') {
      const ap = await this.applicantsRepo.findOne({ where: { id: payload.sub } });
      if (!ap || ap.tokenVersion !== payload.tv) throw new UnauthorizedException('Your session has expired. Please log in again.');
      return { type: 'applicant', id: payload.sub };
    }
    throw new UnauthorizedException('Your session has expired. Please log in again.');
  }

  // ------------------------------------------------------ client activation

  private async findPolicyByNo(policyNo: string): Promise<PolicyEntity | null> {
    const norm = normalizePolicyNoForLookup(policyNo);
    return this.policiesRepo
      .createQueryBuilder('policy')
      .leftJoinAndSelect('policy.client', 'client')
      .where("REGEXP_REPLACE(UPPER(REGEXP_REPLACE(policy.\"policyNo\", '\\s+', '', 'g')), '(\\D)0+(\\d+)$', '\\1\\2') = :norm", { norm })
      .getOne();
  }

  private newCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /**
   * Step 1 of first-time setup (and of "forgot PIN"): the client enters
   * their policy number and the phone number we have on file. If they
   * match, a 6-digit code is texted to that phone. The response is the
   * same whether or not they match, so this can't be used to find out
   * who is a client.
   */
  async startActivation(policyNo: string, phone: string): Promise<{ message: string }> {
    const generic = { message: 'If those details match our records, a 6-digit code has been sent by SMS to the phone number we hold for you. If it does not arrive, please contact the office.' };
    const policy = await this.findPolicyByNo(policyNo);
    if (!policy || !policy.client) return generic;
    if (normalizePhone(policy.client.phone) !== normalizePhone(phone)) return generic;

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.codesRepo.count({ where: { clientId: policy.client.id, source: 'sms', createdAt: MoreThan(since) } });
    if (recent >= MAX_CODES_PER_HOUR) {
      throw new ForbiddenException('Too many codes requested. Please wait an hour or contact the office.');
    }

    const code = this.newCode();
    await this.codesRepo.save(
      this.codesRepo.create({
        clientId: policy.client.id,
        codeHash: sha(code),
        source: 'sms',
        expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
      }),
    );
    // Sent immediately (not held in the manual-approval queue): this is a
    // security code the person is waiting for, requested by them.
    await this.notifications.queueSms({
      toPhone: policy.client.phone,
      relatedType: 'app_code',
      relatedId: policy.client.id,
      templateCode: 'app_activation_code',
      body: `Enhanced Mutual: your app code is ${code}. It expires in ${CODE_MINUTES} minutes. Never share it with anyone.`,
    });
    return generic;
  }

  /** Issued by staff for clients whose phone number on file is wrong or missing. The plain code is returned once to the staff member, never stored. */
  async issueStaffCode(policyNo: string, staffUserId: string): Promise<{ code: string; clientName: string; policyNo: string; expiresAt: Date }> {
    const policy = await this.findPolicyByNo(policyNo);
    if (!policy || !policy.client) throw new BadRequestException('No policy found with that policy number.');
    const code = this.newCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.codesRepo.save(
      this.codesRepo.create({ clientId: policy.client.id, codeHash: sha(code), source: 'staff', expiresAt, createdBy: staffUserId }),
    );
    return { code, clientName: policy.client.fullName, policyNo: policy.policyNo, expiresAt };
  }

  /**
   * First-time PIN setup without an SMS: the person proves they are the client by giving the policy
   * number AND the phone number the company holds. Only allowed while no app account exists yet, so it
   * can never be used to take over or reset an account that is already set up (that needs an SMS or
   * staff code). Repeated wrong guesses lock this route for the policy for an hour.
   */
  async activateDirect(policyNo: string, phone: string, pin: string, pinConfirm: string): Promise<{ token: string; clientName: string }> {
    const mismatch = new UnauthorizedException('Those details do not match our records. Check your policy number and phone number, or ask the office for a setup code.');
    if (pin !== pinConfirm) throw new BadRequestException('The two PINs are not the same. Please type them again.');
    validatePin(pin);
    const policy = await this.findPolicyByNo(policyNo);
    if (!policy || !policy.client) throw mismatch;
    const clientId = policy.client.id;

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const fails = await this.codesRepo.count({ where: { clientId, source: 'direct-fail', createdAt: MoreThan(since) } });
    if (fails >= MAX_DIRECT_FAILS) {
      throw new ForbiddenException('Too many wrong attempts for this policy. Please try again in an hour, or ask the office for a setup code.');
    }
    const given = normalizePhone(phone);
    if (given.length < 8 || normalizePhone(policy.client.phone) !== given) {
      await this.codesRepo.save(this.codesRepo.create({ clientId, codeHash: '', source: 'direct-fail', expiresAt: new Date() }));
      throw mismatch;
    }
    const existing = await this.accountsRepo.findOne({ where: { clientId } });
    if (existing) {
      throw new ForbiddenException('ALREADY_SET_UP: This policy already has a PIN. Please log in, or use "Forgot your PIN?" if you cannot remember it.');
    }
    const acc = await this.accountsRepo.save(this.accountsRepo.create({ clientId, pinHash: await hashPassword(pin), origin: 'existing' }));
    await this.accountsRepo.update(acc.id, { lastLoginAt: new Date() });
    return { token: this.sign('client', clientId, acc.tokenVersion), clientName: policy.client.fullName };
  }

  async completeActivation(policyNo: string, code: string, pin: string): Promise<{ token: string; clientName: string }> {
    validatePin(pin);
    const policy = await this.findPolicyByNo(policyNo);
    const bad = new UnauthorizedException('That code is not valid or has expired. Please request a new one.');
    if (!policy || !policy.client) throw bad;

    const candidates = await this.codesRepo.find({
      where: { clientId: policy.client.id, expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    const live = candidates.filter((c) => !c.usedAt && c.attempts < MAX_CODE_ATTEMPTS);
    if (live.length === 0) throw bad;

    const match = live.find((c) => c.codeHash === sha((code ?? '').trim()));
    if (!match) {
      for (const c of live) await this.codesRepo.update(c.id, { attempts: c.attempts + 1 });
      throw bad;
    }
    await this.codesRepo.update(match.id, { usedAt: new Date() });

    const pinHash = await hashPassword(pin);
    let acc = await this.accountsRepo.findOne({ where: { clientId: policy.client.id } });
    if (acc) {
      await this.accountsRepo.update(acc.id, { pinHash, failedAttempts: 0, lockedUntil: null, tokenVersion: acc.tokenVersion + 1 });
      acc = await this.accountsRepo.findOneOrFail({ where: { id: acc.id } });
    } else {
      acc = await this.accountsRepo.save(this.accountsRepo.create({ clientId: policy.client.id, pinHash, origin: 'existing' }));
    }
    await this.accountsRepo.update(acc.id, { lastLoginAt: new Date() });
    return { token: this.sign('client', policy.client.id, acc.tokenVersion), clientName: policy.client.fullName };
  }

  // ------------------------------------------------------------ client login

  async login(policyNo: string, pin: string): Promise<{ token: string; clientName: string }> {
    const generic = new UnauthorizedException('Policy number or PIN is not correct.');
    const policy = await this.findPolicyByNo(policyNo);
    if (!policy || !policy.client) throw generic;
    const acc = await this.accountsRepo.findOne({ where: { clientId: policy.client.id } });
    if (!acc) {
      throw new ForbiddenException('NOT_ACTIVATED: This policy has not been set up in the app yet. Use "First time here?" to create your PIN.');
    }
    if (acc.lockedUntil && acc.lockedUntil > new Date()) {
      const mins = Math.ceil((acc.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(`Too many wrong attempts. Please try again in ${mins} minute(s), or reset your PIN with "Forgot PIN?".`);
    }
    const ok = await verifyPassword(pin ?? '', acc.pinHash);
    if (!ok) {
      const failed = acc.failedAttempts + 1;
      if (failed >= MAX_FAILED_ATTEMPTS) {
        await this.accountsRepo.update(acc.id, { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) });
        throw new ForbiddenException(`Too many wrong attempts. This account is locked for ${LOCK_MINUTES} minutes.`);
      }
      await this.accountsRepo.update(acc.id, { failedAttempts: failed });
      throw generic;
    }

    // Clients who joined through an in-app application get full access only
    // once their first premium is actually on file.
    if (acc.origin === 'application') {
      const paid = await this.paymentsRepo
        .createQueryBuilder('p')
        .innerJoin('p.policy', 'policy')
        .where('policy."clientId" = :cid', { cid: policy.client.id })
        .andWhere("p.\"reversalStatus\" != 'Reversed'")
        .getCount();
      if (paid === 0) {
        throw new ForbiddenException('AWAITING_PAYMENT: Your application is approved. Your account opens once your first premium is received - an officer will contact you about how to pay.');
      }
    }

    await this.accountsRepo.update(acc.id, { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });
    return { token: this.sign('client', policy.client.id, acc.tokenVersion), clientName: policy.client.fullName };
  }

  async changePin(clientId: string, oldPin: string, newPin: string): Promise<{ token: string }> {
    validatePin(newPin);
    const acc = await this.accountsRepo.findOne({ where: { clientId } });
    if (!acc || !(await verifyPassword(oldPin ?? '', acc.pinHash))) throw new UnauthorizedException('Your current PIN is not correct.');
    await this.accountsRepo.update(acc.id, { pinHash: await hashPassword(newPin), tokenVersion: acc.tokenVersion + 1, failedAttempts: 0 });
    return { token: this.sign('client', clientId, acc.tokenVersion + 1) };
  }

  // -------------------------------------------------------------- applicants

  async registerApplicant(fullName: string, phone: string, pin: string): Promise<{ token: string; fullName: string }> {
    validatePin(pin);
    const norm = normalizePhone(phone);
    if (norm.length < 8) throw new BadRequestException('Please enter a valid phone number.');
    const existing = await this.applicantsRepo.findOne({ where: { phone: norm } });
    if (existing) throw new BadRequestException('That phone number already has an account. Please log in instead.');
    const ap = await this.applicantsRepo.save(
      this.applicantsRepo.create({ fullName: fullName.trim(), phone: norm, pinHash: await hashPassword(pin) }),
    );
    return { token: this.sign('applicant', ap.id, ap.tokenVersion), fullName: ap.fullName };
  }

  async applicantLogin(phone: string, pin: string): Promise<{ token: string; fullName: string }> {
    const generic = new UnauthorizedException('Phone number or PIN is not correct.');
    const ap = await this.applicantsRepo.findOne({ where: { phone: normalizePhone(phone) } });
    if (!ap) throw generic;
    if (ap.lockedUntil && ap.lockedUntil > new Date()) {
      const mins = Math.ceil((ap.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(`Too many wrong attempts. Please try again in ${mins} minute(s).`);
    }
    if (!(await verifyPassword(pin ?? '', ap.pinHash))) {
      const failed = ap.failedAttempts + 1;
      if (failed >= MAX_FAILED_ATTEMPTS) {
        await this.applicantsRepo.update(ap.id, { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) });
        throw new ForbiddenException(`Too many wrong attempts. This account is locked for ${LOCK_MINUTES} minutes.`);
      }
      await this.applicantsRepo.update(ap.id, { failedAttempts: failed });
      throw generic;
    }
    await this.applicantsRepo.update(ap.id, { failedAttempts: 0, lockedUntil: null });
    return { token: this.sign('applicant', ap.id, ap.tokenVersion), fullName: ap.fullName };
  }

  /** Staff-assisted PIN reset for an applicant who forgot theirs. */
  async resetApplicantPin(applicantId: string, newPin: string): Promise<void> {
    validatePin(newPin);
    const ap = await this.applicantsRepo.findOne({ where: { id: applicantId } });
    if (!ap) throw new BadRequestException('Applicant not found.');
    await this.applicantsRepo.update(ap.id, { pinHash: await hashPassword(newPin), tokenVersion: ap.tokenVersion + 1, failedAttempts: 0, lockedUntil: null });
  }
}
