import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1783692571893 implements MigrationInterface {
  name = 'InitSchema1783692571893';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "brand_id" character varying(64) NOT NULL, "email" character varying(320) NOT NULL, "password_hash" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_users_brand_email" UNIQUE ("brand_id", "email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_brand_id" ON "users" ("brand_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "brand_id" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_user_id" ON "sessions" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."raw_event_source" AS ENUM('psp', 'gsp')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."raw_event_status" AS ENUM('received', 'processed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "raw_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "source" "public"."raw_event_source" NOT NULL, "provider" character varying(64) NOT NULL, "brand_id" character varying(64) NOT NULL, "external_event_id" character varying(255) NOT NULL, "payload" jsonb NOT NULL, "headers" jsonb NOT NULL, "status" "public"."raw_event_status" NOT NULL DEFAULT 'received', "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "processed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5da37c4a4297afca88e18072385" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_raw_events_brand_status" ON "raw_events" ("brand_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scope" character varying(64) NOT NULL, "brand_id" character varying(64) NOT NULL, "key" character varying(512) NOT NULL, "raw_event_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_idempotency_scope_brand_key" UNIQUE ("scope", "brand_id", "key"), CONSTRAINT "PK_8ad20779ad0411107a56e53d0f6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19"`,
    );
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_raw_events_brand_status"`,
    );
    await queryRunner.query(`DROP TABLE "raw_events"`);
    await queryRunner.query(`DROP TYPE "public"."raw_event_status"`);
    await queryRunner.query(`DROP TYPE "public"."raw_event_source"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_user_id"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP INDEX "public"."idx_users_brand_id"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
