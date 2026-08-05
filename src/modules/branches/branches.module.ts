import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from './entities/branch.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { UserEntity } from '../identity-access/entities/user.entity';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BranchEntity, ClientEntity, UserEntity])],
  providers: [BranchesService],
  controllers: [BranchesController],
  exports: [BranchesService],
})
export class BranchesModule {}
