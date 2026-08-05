import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClaimPayoutFields1785321357616 implements MigrationInterface {
    name = 'AddClaimPayoutFields1785321357616'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "claims" ADD "datePaid" date`);
        await queryRunner.query(`ALTER TABLE "claims" ADD "paymentMethod" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "claims" DROP COLUMN "paymentMethod"`);
        await queryRunner.query(`ALTER TABLE "claims" DROP COLUMN "datePaid"`);
    }

}
