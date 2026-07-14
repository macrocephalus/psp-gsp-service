import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * scope = `<source>:<provider>`: провайдер валидируется до 64 символов,
 * плюс префикс `psp:`/`gsp:` — итого до 68. Старый varchar(64) ронял
 * такой INSERT в 500; 128 даёт запас и на более длинные scope в будущем.
 */
export class WidenIdempotencyScope1784023546066 implements MigrationInterface {
  name = 'WidenIdempotencyScope1784023546066';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ALTER COLUMN "scope" TYPE character varying(128)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ALTER COLUMN "scope" TYPE character varying(64)`,
    );
  }
}
