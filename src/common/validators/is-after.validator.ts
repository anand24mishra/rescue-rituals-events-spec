import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Validates that this ISO date-time property is strictly later than another
 * property on the same object.
 *
 * Only meaningful when both values are present, so a partial update (PATCH with
 * `endsAt` alone) passes here and is re-checked against the stored row in the
 * service. The database CHECK constraint is the backstop for both paths.
 */
export function IsAfterProperty(
  otherProperty: string,
  options?: ValidationOptions,
) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isAfterProperty',
      target: target.constructor,
      propertyName,
      constraints: [otherProperty],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const other = (args.object as Record<string, unknown>)[
            args.constraints[0] as string
          ];

          if (typeof value !== 'string' || typeof other !== 'string') {
            return true;
          }

          const thisTime = Date.parse(value);
          const otherTime = Date.parse(other);
          if (Number.isNaN(thisTime) || Number.isNaN(otherTime)) return true;

          return thisTime > otherTime;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be later than ${args.constraints[0] as string}`;
        },
      },
    });
  };
}
