import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientEntity } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { FILE_STORAGE, FileStorageAdapter } from '../documents/adapters/file-storage.adapter';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @Inject(FILE_STORAGE) private readonly storage: FileStorageAdapter,
  ) {}

  async create(dto: CreateClientDto): Promise<ClientEntity> {
    const clientNo = await this.nextClientNo();
    const referralCode = clientNo.replace('CL-', 'REF-');

    let referredByClientId: string | null = null;
    if (dto.referredByCode) {
      const referrer = await this.clientsRepo.findOne({ where: { referralCode: dto.referredByCode } });
      // An unrecognized code isn't fatal to registration - just isn't
      // credited as a referral. Front-desk staff shouldn't be blocked
      // from onboarding someone over a typo'd code.
      referredByClientId = referrer ? referrer.id : null;
    }

    const { referredByCode, ...rest } = dto;
    void referredByCode;
    const client = this.clientsRepo.create({ ...rest, clientNo, referralCode, referredByClientId });
    return this.clientsRepo.save(client);
  }

  async findAll(query: {
    search?: string;
    district?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: ClientEntity[]; total: number; page: number; pageSize: number }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;

    const qb = this.clientsRepo.createQueryBuilder('client');
    if (query.search) {
      qb.andWhere(
        '(client.fullName ILIKE :search OR client.phone ILIKE :search OR client.clientNo ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.district) qb.andWhere('client.district = :district', { district: query.district });
    if (query.status) qb.andWhere('client.status = :status', { status: query.status });

    const [data, total] = await qb
      .orderBy('client.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<ClientEntity> {
    const client = await this.clientsRepo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  /**
   * Counts referrals per referring client - total and how many of those
   * referred clients are actually Active (a referral that never becomes
   * a real policyholder isn't the thing worth rewarding).
   */
  async referralLeaderboard(): Promise<
    { referrerId: string; referrerName: string; referrerPhone: string; referralCount: number; activeReferralCount: number }[]
  > {
    const rows = await this.clientsRepo
      .createQueryBuilder('referred')
      .innerJoin(ClientEntity, 'referrer', 'referrer.id = referred."referredByClientId"')
      .select('referrer.id', 'referrerId')
      .addSelect('referrer.fullName', 'referrerName')
      .addSelect('referrer.phone', 'referrerPhone')
      .addSelect('COUNT(*)', 'referralCount')
      .addSelect("COUNT(*) FILTER (WHERE referred.status = 'Active')", 'activeReferralCount')
      .groupBy('referrer.id')
      .addGroupBy('referrer.fullName')
      .addGroupBy('referrer.phone')
      .orderBy('"activeReferralCount"', 'DESC')
      .getRawMany();
    return rows.map((r) => ({ ...r, referralCount: Number(r.referralCount), activeReferralCount: Number(r.activeReferralCount) }));
  }

  async findByReferralCode(code: string): Promise<ClientEntity | null> {
    return this.clientsRepo.findOne({ where: { referralCode: code } });
  }

  async findReferrals(clientId: string): Promise<ClientEntity[]> {
    return this.clientsRepo.find({ where: { referredByClientId: clientId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Direct data correction, not a normal workflow transition - status
   * changes elsewhere in the app go through their own audited business
   * logic (e.g. policy reinstatement). This is the "Supreme Admin can
   * edit any part of data entered" escape hatch for genuine mistakes,
   * so it accepts whatever subset of fields is sent rather than
   * enforcing a workflow.
   */
  async editFields(id: string, fields: Partial<ClientEntity>): Promise<ClientEntity> {
    const allowed: (keyof ClientEntity)[] = [
      'fullName', 'gender', 'dob', 'phone', 'altPhone', 'nationalId', 'address', 'district',
      'occupation', 'employerOrGroup', 'clientCategory', 'smsConsent', 'email', 'status', 'kycStatus',
    ];
    const update: Partial<ClientEntity> = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) (update as any)[key] = fields[key];
    }
    await this.clientsRepo.update(id, update);
    return this.findOne(id);
  }

  async uploadPhoto(id: string, buffer: Buffer, originalFilename: string, mimeType: string): Promise<ClientEntity> {
    const client = await this.findOne(id);
    if (client.photoStorageKey) {
      await this.storage.delete(client.photoStorageKey).catch(() => undefined);
    }
    const stored = await this.storage.save(buffer, originalFilename, mimeType);
    await this.clientsRepo.update(id, { photoStorageKey: stored.storageKey, photoMimeType: mimeType });
    return this.findOne(id);
  }

  async downloadPhoto(id: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const client = await this.findOne(id);
    if (!client.photoStorageKey) throw new NotFoundException('This client has no photo on file.');
    const buffer = await this.storage.read(client.photoStorageKey);
    return { buffer, mimeType: client.photoMimeType || 'application/octet-stream' };
  }

  private async nextClientNo(): Promise<string> {
    const count = await this.clientsRepo.count();
    return `CL-${String(count + 1).padStart(5, '0')}`;
  }
}
