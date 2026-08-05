import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../identity-access/entities/user.entity';
import { DirectoryController } from './directory.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [DirectoryController],
})
export class DirectoryModule {}
