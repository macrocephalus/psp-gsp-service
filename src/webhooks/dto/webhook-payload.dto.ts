import {
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/**
 * "plain object" (словник), а не масив і не null.
 * @IsObject самого по собі мало: масив теж typeof 'object', тож він пройшов би.
 */
function IsPlainObject(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPlainObject',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'object' && value !== null && !Array.isArray(value)
          );
        },
        defaultMessage(): string {
          return 'data must be an object';
        },
      },
    });
  };
}

export class WebhookPayloadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  eventId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  type: string; // 'deposit.succeeded', 'bet.settled', ... — тип события

  @IsPlainObject()
  data: Record<string, unknown>;
}
