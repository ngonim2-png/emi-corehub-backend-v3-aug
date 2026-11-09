import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';

const PORTAL_TOKEN_EXPIRY = '2h';

/**
 * Deliberately its own auth path, not a variant of staff login. A
 * client proves themselves with policy number + phone - lighter than
 * staff credentials by design (the person's own choice, made with the
 * tradeoff explained), so this is kept on a completely separate JWT
 * secret and a narrow token shape (clientId + type:'portal' only, no
 * role, no staff claims) specifically so a leaked or forged staff
 * token could never be replayed here, and vice versa.
 */
@Injectable()
export class PortalAuthService {
  constructor(
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    private readonly config: ConfigService,
  ) {}

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s-]/g, '');
  }

  async login(policyNo: string, phone: string): Promise<{ portalToken: string; clientName: string }> {
    const policy = await this.policiesRepo.findOne({
      where: { policyNo: policyNo.trim() },
      relations: ['client'],
    });
    if (!policy || this.normalizePhone(policy.client.phone) !== this.normalizePhone(phone)) {
      throw new UnauthorizedException('We could not find a policy matching that policy number and phone number.');
    }
    const secret = this.config.get<string>('portalJwtSecret');
    if (!secret) {
      throw new UnauthorizedException('The client portal is not configured on this environment yet.');
    }
    const portalToken = jwt.sign({ sub: policy.client.id, type: 'portal' }, secret, { expiresIn: PORTAL_TOKEN_EXPIRY });
    return { portalToken, clientName: policy.client.fullName };
  }

  verifyToken(token: string): string {
    const secret = this.config.get<string>('portalJwtSecret');
    if (!secret) throw new UnauthorizedException('The client portal is not configured on this environment yet.');
    try {
      const payload = jwt.verify(token, secret) as { sub: string; type: string };
      if (payload.type !== 'portal') throw new Error('wrong token type');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Your session has expired. Please log in again.');
    }
  }
}
