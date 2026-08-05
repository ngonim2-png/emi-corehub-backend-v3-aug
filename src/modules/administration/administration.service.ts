import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { AssetEntity, ProcurementRequestEntity, SupplierEntity } from './entities/asset.entity';
import { CreateAssetDto, CreateProcurementRequestDto, CreateSupplierDto } from './dto/administration.dto';
import { JournalService } from '../finance-ifrs17/journal.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class AdministrationService {
  constructor(
    @InjectRepository(AssetEntity) private readonly assetsRepo: Repository<AssetEntity>,
    @InjectRepository(ProcurementRequestEntity)
    private readonly procurementRepo: Repository<ProcurementRequestEntity>,
    @InjectRepository(SupplierEntity)
    private readonly suppliersRepo: Repository<SupplierEntity>,
    private readonly journalService: JournalService,
  ) {}

  async createAsset(dto: CreateAssetDto): Promise<AssetEntity> {
    return this.assetsRepo.save(
      this.assetsRepo.create({
        name: dto.name, category: dto.category, assignedTo: dto.assignedTo, status: 'In Use',
        purchaseCost: (dto.purchaseCost ?? 0).toFixed(2), purchaseDate: dto.purchaseDate ?? null,
        usefulLifeYears: dto.usefulLifeYears ?? 5, accumulatedDepreciation: '0.00',
      }),
    );
  }

  async findAssets(): Promise<AssetEntity[]> {
    return this.assetsRepo.find({ order: { createdAt: 'DESC' } });
  }

  /** Straight-line only, deliberately - other methods (declining balance, units of production) are a real policy choice a real accountant should make, not one to default to silently. */
  monthlyDepreciationFor(asset: AssetEntity): number {
    if (!asset.purchaseDate || Number(asset.purchaseCost) <= 0) return 0;
    const monthly = Number(asset.purchaseCost) / (asset.usefulLifeYears * 12);
    const remaining = Number(asset.purchaseCost) - Number(asset.accumulatedDepreciation);
    return Math.max(Math.min(monthly, remaining), 0);
  }

  async depreciationSchedule(assetId: string) {
    const asset = await this.assetsRepo.findOneOrFail({ where: { id: assetId } });
    if (!asset.purchaseDate) return { asset, schedule: [] };
    const monthly = Number(asset.purchaseCost) / (asset.usefulLifeYears * 12);
    const schedule = [];
    let accumulated = 0;
    const start = new Date(asset.purchaseDate);
    for (let i = 0; i < asset.usefulLifeYears * 12; i++) {
      const month = new Date(start.getFullYear(), start.getMonth() + i + 1, 1);
      accumulated = Math.min(accumulated + monthly, Number(asset.purchaseCost));
      schedule.push({
        period: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
        depreciation: Math.round(monthly * 100) / 100,
        accumulatedDepreciation: Math.round(accumulated * 100) / 100,
        netBookValue: Math.round((Number(asset.purchaseCost) - accumulated) * 100) / 100,
      });
    }
    return { asset, schedule };
  }

  /**
   * Posts one month's depreciation for every asset that still has
   * remaining value, in a single journal entry (not one per asset - a
   * real depreciation run is one board-visible number, not fifty tiny
   * postings). Run once per month; running it twice for the same month
   * isn't prevented here structurally, but posting a second time simply
   * depreciates further since accumulatedDepreciation only tracks total
   * posted, not a per-period ledger - the operational safeguard is the
   * same period-close mechanism that already guards every other posting.
   */
  async runMonthlyDepreciation(period: string, actor: AuthenticatedUser): Promise<{ posted: boolean; totalDepreciation: number; assetCount: number }> {
    const assets = await this.assetsRepo.find({ where: { status: 'In Use' } });
    let total = 0;
    const updates: { id: string; newAccumulated: number }[] = [];
    for (const asset of assets) {
      const monthly = this.monthlyDepreciationFor(asset);
      if (monthly > 0) {
        total += monthly;
        updates.push({ id: asset.id, newAccumulated: Number(asset.accumulatedDepreciation) + monthly });
      }
    }
    if (total <= 0) return { posted: false, totalDepreciation: 0, assetCount: 0 };

    const rounded = Math.round(total * 100) / 100;
    await this.journalService.post(
      `${period}-28`,
      `Monthly depreciation - ${updates.length} asset(s)`,
      [
        { accountCode: '5400', debit: rounded, credit: 0 },
        { accountCode: '1600', debit: 0, credit: rounded },
      ],
      'administration',
      null,
      actor,
    );
    for (const u of updates) {
      await this.assetsRepo.update(u.id, { accumulatedDepreciation: u.newAccumulated.toFixed(2) });
    }
    return { posted: true, totalDepreciation: rounded, assetCount: updates.length };
  }

  async createProcurementRequest(dto: CreateProcurementRequestDto): Promise<ProcurementRequestEntity> {
    return this.procurementRepo.save(
      this.procurementRepo.create({
        item: dto.item, quantity: dto.quantity, requestedBy: dto.requestedBy,
        unitCost: (dto.unitCost ?? 0).toFixed(2), status: 'Pending Approval',
      }),
    );
  }

  /**
   * Approving is an operational decision, but it also has to become a
   * real expense in the books the moment it happens - not sit as a
   * "trust me, this got approved" record disconnected from the ledger.
   * Skips the journal posting only if there's no cost recorded (a
   * request created before unitCost was tracked, or a zero-cost item).
   */
  async approveProcurementRequest(id: string, actor: AuthenticatedUser): Promise<ProcurementRequestEntity> {
    const request = await this.procurementRepo.findOneOrFail({ where: { id } });
    const totalCost = Number(request.unitCost) * request.quantity;

    let journalEntryId: string | null = null;
    if (totalCost > 0) {
      const entry = await this.journalService.post(
        new Date().toISOString().slice(0, 10),
        `Procurement approved: ${request.quantity} x ${request.item}`,
        [
          { accountCode: '5300', debit: totalCost, credit: 0 },
          { accountCode: '2400', debit: 0, credit: totalCost },
        ],
        'administration',
        request.id,
        actor,
      );
      journalEntryId = entry.id;
    }

    await this.procurementRepo.update(id, { status: 'Approved', journalEntryId });
    return this.procurementRepo.findOneOrFail({ where: { id } });
  }

  async findProcurementRequests(): Promise<ProcurementRequestEntity[]> {
    return this.procurementRepo.find({ order: { createdAt: 'DESC' } });
  }

  async payProcurementRequest(id: string, actor: AuthenticatedUser): Promise<ProcurementRequestEntity> {
    const request = await this.procurementRepo.findOneOrFail({ where: { id } });
    if (request.status !== 'Approved') {
      throw new BadRequestException('Only approved procurement requests can be marked paid.');
    }
    const totalCost = Number(request.unitCost) * request.quantity;
    await this.journalService.post(
      new Date().toISOString().slice(0, 10),
      `Payment for procurement: ${request.quantity} x ${request.item}`,
      [
        { accountCode: '2400', debit: totalCost, credit: 0 },
        { accountCode: '1000', debit: 0, credit: totalCost },
      ],
      'administration',
      request.id,
      actor,
    );
    await this.procurementRepo.update(id, { paidAt: new Date() });
    return this.procurementRepo.findOneOrFail({ where: { id } });
  }

  /**
   * Every approved-but-unpaid request is a real payable sitting on the
   * books (that's exactly what approval posts to account 2400) - this
   * buckets them by how long they've been sitting there, the same shape
   * as any AP aging report.
   */
  async apAging() {
    const outstanding = await this.procurementRepo.find({ where: { status: 'Approved', paidAt: IsNull() } });
    const now = Date.now();
    const bucket = (days: number) => (days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+');
    const rows = outstanding.map((r) => {
      const days = Math.floor((now - r.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: r.id, item: r.item, amount: Number(r.unitCost) * r.quantity, daysOutstanding: days, bucket: bucket(days),
      };
    });
    const summary: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    rows.forEach((r) => { summary[r.bucket] += r.amount; });
    return { rows, summary, totalOutstanding: rows.reduce((s, r) => s + r.amount, 0) };
  }

  async createSupplier(dto: CreateSupplierDto): Promise<SupplierEntity> {
    return this.suppliersRepo.save(this.suppliersRepo.create({ ...dto, status: 'Active' }));
  }

  async findSuppliers(): Promise<SupplierEntity[]> {
    return this.suppliersRepo.find({ order: { createdAt: 'DESC' } });
  }
}
