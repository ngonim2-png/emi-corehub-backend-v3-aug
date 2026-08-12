import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PolicyDocumentTemplateEntity } from './entities/policy-document-template.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { PolicyDocumentsService } from './policy-documents.service';
import { PolicyDocumentsController } from './policy-documents.controller';
import { DocumentsModule } from '../documents/documents.module';
import { ClientsPoliciesModule } from '../clients-policies/clients-policies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PolicyDocumentTemplateEntity, PolicyEntity]),
    DocumentsModule,
    ClientsPoliciesModule,
  ],
  providers: [PolicyDocumentsService],
  controllers: [PolicyDocumentsController],
})
export class PolicyDocumentsModule {}
