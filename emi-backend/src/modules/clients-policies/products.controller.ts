import { Body, Controller, Get, Param, Post, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { ProductEntity } from './entities/product.entity';
import { PolicyEntity } from './entities/policy.entity';

export class CreateProductDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsNumber()
  @Min(0)
  minPremium: number;

  @IsNumber()
  @Min(0)
  maxPremium: number;
}

export class EditProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPremium?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPremium?: number;
}

@Controller('products')
export class ProductsController {
  constructor(
    @InjectRepository(ProductEntity) private readonly productsRepo: Repository<ProductEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
  ) {}

  @Get()
  async findAll() {
    return this.productsRepo.find({ order: { name: 'ASC' } });
  }

  @Post()
  @Roles('Super Admin', 'Underwriting Officer')
  async create(@Body() dto: CreateProductDto) {
    return this.productsRepo.save(
      this.productsRepo.create({
        code: dto.code,
        name: dto.name,
        category: dto.category,
        minPremium: dto.minPremium.toFixed(2),
        maxPremium: dto.maxPremium.toFixed(2),
      }),
    );
  }

  /** Editing an existing product changes terms on policies clients already hold, so it's a Super Admin (or above) action, not open to whoever can create a new one. */
  @Post(':id/edit')
  @Roles('Super Admin')
  @AuditLog({ action: 'product.edited', entityType: 'product' })
  async edit(@Param('id') id: string, @Body() dto: EditProductDto) {
    const update: Partial<ProductEntity> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.category !== undefined) update.category = dto.category;
    if (dto.minPremium !== undefined) update.minPremium = dto.minPremium.toFixed(2);
    if (dto.maxPremium !== undefined) update.maxPremium = dto.maxPremium.toFixed(2);
    await this.productsRepo.update(id, update);
    return this.productsRepo.findOneOrFail({ where: { id } });
  }

  /**
   * Deletion is explicitly blocked while any policy still references
   * this product - a clear, specific error here beats a raw foreign-key
   * violation bubbling up from Postgres. Retiring a product that's no
   * longer sold but still has active policyholders should happen by
   * simply not offering it for new business, not by deleting the row
   * those policies depend on.
   */
  @Post(':id/delete')
  @Roles('Super Admin')
  @AuditLog({ action: 'product.deleted', entityType: 'product' })
  async delete(@Param('id') id: string) {
    const policyCount = await this.policiesRepo.count({ where: { product: { id } } });
    if (policyCount > 0) {
      throw new BadRequestException(
        `Cannot delete this product - ${policyCount} polic${policyCount === 1 ? 'y' : 'ies'} still reference it. Stop offering it for new business instead of deleting it.`,
      );
    }
    await this.productsRepo.delete(id);
    return { deleted: true };
  }
}
