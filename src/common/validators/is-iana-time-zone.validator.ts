import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Computed once: `Intl.supportedValuesOf` builds a ~600 element array, and this
 * validator can run on every event write.
 */
const supportedTimeZones = new Set<string>(
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : [],
);

/**
 * Validates an IANA time zone name such as `America/New_York` against the
 * runtime's own zone database.
 *
 * Checking the shape with a regex would accept `Foo/Bar`, and the point of
 * storing a zone is that a client can later format times with it — a name the
 * runtime does not recognise is useless for that.
 */
export function IsIanaTimeZone(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          // An empty zone set means the runtime does not expose its zone list;
          // fall back to a structural check rather than rejecting everything.
          if (supportedTimeZones.size === 0) {
            return /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2}$|^UTC$/.test(value);
          }
          return supportedTimeZones.has(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid IANA time zone, for example America/New_York`;
        },
      },
    });
  };
}
