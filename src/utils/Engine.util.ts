import traverse from 'traverse';
import { typof, date } from 'typof';

import type { AnyObject } from '../types/AnyObject.type';
import type { Schema, Type, TypeSingle } from '../types/Schema.type';
import type { TeyitOptions } from '../types/TeyitOptions.type';
import type { UnknownObject } from '../types/UnknownObject.type';
import { ValidationError } from '../types/ValidationError.type';

const formatPath = (path_array: string[]) =>
  path_array.reduce((acc, key) => {
    if (/^\d+$/.test(key)) return `${acc}[${key}]`;

    if (acc === '') return key;

    return `${acc}.${key}`;
  }, '');

const getSchema = (schema: Schema | Type, path_array: string[], property?: unknown): TypeSingle | undefined => {
  if (path_array.length === 0) {
    if (Array.isArray(schema)) {
      if (property === undefined) return schema[0] as TypeSingle;

      const matched = schema.find((type) => {
        const schema = type as TypeSingle;

        if (property === null) return schema.nullable;

        if (schema.type === 'date') return typeof property === 'string' || property instanceof Date;
        if (schema.type === 'array') return Array.isArray(property);
        if (schema.type === 'object') return typeof property === 'object' && !Array.isArray(property);

        return typeof property === schema.type;
      });

      return (matched ?? schema[0]) as TypeSingle;
    }

    if (typeof schema === 'object') return schema as TypeSingle;

    return;
  }

  const [key, ...rest_path] = path_array;

  if (Array.isArray(schema)) {
    for (const item of schema) {
      const result = getSchema(item, path_array, property);

      if (result !== undefined) return result;
    }

    return;
  }

  if (typeof schema === 'object') {
    if ('type' in schema) {
      if (schema.type === 'object' && 'properties' in schema) return getSchema(schema.properties, path_array, property);

      if (schema.type === 'array' && 'items' in schema) if (/^\d+$/.test(key)) return getSchema(schema.items, rest_path, property);

      return;
    }

    const schema_record = schema as Record<string, Type>;

    if (key in schema_record) return getSchema(schema_record[key], rest_path, property);
  }
};

const seedMissingProperties = (schema: unknown, properties: unknown) => {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return;
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) return;

  const schema_record = schema as Record<string, unknown>;
  const properties_record = properties as Record<string, unknown>;

  for (const key of Object.keys(schema_record)) {
    const schema = schema_record[key];

    if (!(key in properties_record)) properties_record[key] = undefined;

    if (typeof schema === 'object' && schema !== null && !Array.isArray(schema) && 'type' in schema && schema.type === 'object' && 'properties' in schema && typeof properties_record[key] === 'object' && properties_record[key] !== null && !Array.isArray(properties_record[key])) seedMissingProperties(schema.properties, properties_record[key]);
  }
};

export const validate = (schema: Schema, properties: UnknownObject, options: TeyitOptions): Promise<AnyObject> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      void (async () => {
        if (Array.isArray(schema)) {
          const schema_union = schema as Record<string, Type>[];

          let last_error = new Error();
          let passed = false;

          for (const schema_single of schema_union) {
            try {
              const properties_clone = JSON.parse(JSON.stringify(properties)) as UnknownObject;

              const valid_properties = await validate(schema_single as Schema, properties_clone, options);

              passed = true;

              resolve(valid_properties as UnknownObject);
            } catch (error) {
              last_error = error instanceof Error ? error : new Error(String(error));
            }
          }

          if (!passed) reject(last_error);

          return;
        }

        try {
          seedMissingProperties(schema, properties);

          // eslint-disable-next-line no-restricted-syntax
          traverse(properties).forEach(function (property) {
            if (this.isRoot) return;

            const path = formatPath(this.path);
            const equivalent = getSchema(schema, this.path, property);

            if (!equivalent) {
              if (options.validate_options?.strip_unknown === true) this.delete();

              return;
            }

            if (property === null) {
              if (!equivalent.nullable && equivalent.default !== null) throw new ValidationError({ message: (options.error_messages?.base?.nullable ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              return;
            }

            if (property === undefined) {
              if (equivalent.default !== undefined) {
                this.update(equivalent.default);

                property = equivalent.default;
              } else if (equivalent.required) throw new ValidationError({ message: (options.error_messages?.base?.required ?? '').replaceAll('{path}', path), code: '', parts: { path } });
            }

            if (equivalent.type === 'string') {
              if (typeof property !== 'string') throw new ValidationError({ message: (options.error_messages?.string?.type ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              if (equivalent.trim !== false) this.update(property.trim());

              if (equivalent.lowercase === true) this.update(property.toLowerCase());

              if (equivalent.uppercase === true) this.update(property.toUpperCase());

              if (
                equivalent.enum !== undefined &&
                !equivalent.enum
                  .map((item) => {
                    if (equivalent.trim !== false) item = item.trim();
                    if (equivalent.lowercase === true) item = item.toLowerCase();
                    if (equivalent.uppercase === true) item = item.toUpperCase();

                    return item;
                  })
                  .includes(property)
              )
                throw new ValidationError({ message: (options.error_messages?.string?.enum ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              if (equivalent.pattern !== undefined && !new RegExp(equivalent.pattern).test(property)) {
                const pattern = equivalent.pattern ? new RegExp(equivalent.pattern).source : '';

                throw new ValidationError({ message: (options.error_messages?.string?.pattern ?? '').replaceAll('{path}', path).replaceAll('{pattern}', pattern), code: '', parts: { path, pattern } });
              }

              if (equivalent.min !== undefined && property.length < equivalent.min) {
                const part_min = String(equivalent.min);
                const plural_suffix = equivalent.min > 1 ? 's' : '';

                throw new ValidationError({
                  message: (options.error_messages?.string?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', part_min).replaceAll('{plural_suffix}', plural_suffix),
                  code: '',
                  parts: { path, min: part_min, plural_suffix }
                });
              }

              if (equivalent.max !== undefined && property.length > equivalent.max) {
                const part_max = String(equivalent.max);
                const plural_suffix = equivalent.max > 1 ? 's' : '';

                throw new ValidationError({
                  message: (options.error_messages?.string?.max ?? '').replaceAll('{path}', path).replaceAll('{max}', part_max).replaceAll('{plural_suffix}', plural_suffix),
                  code: '',
                  parts: { path, max: part_max, plural_suffix }
                });
              }
            } else if (equivalent.type === 'number') {
              if (typeof property !== 'number') throw new ValidationError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              if (equivalent.enum !== undefined && !equivalent.enum.includes(property)) throw new ValidationError({ message: (options.error_messages?.number?.enum ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              if (equivalent.min !== undefined && property < equivalent.min) {
                const part_min = String(equivalent.min);

                throw new ValidationError({ message: (options.error_messages?.number?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', part_min), code: '', parts: { path, min: part_min } });
              }

              if (equivalent.max !== undefined && property > equivalent.max) {
                const part_max = String(equivalent.max);

                throw new ValidationError({ message: (options.error_messages?.number?.max ?? '').replaceAll('{path}', path).replaceAll('{max}', part_max), code: '', parts: { path, max: part_max } });
              }

              if (equivalent.integer === true && !Number.isInteger(property)) throw new ValidationError({ message: (options.error_messages?.number?.integer ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              if (equivalent.positive === true && property < 0) throw new ValidationError({ message: (options.error_messages?.number?.positive ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              if (equivalent.negative === true && property >= 0) throw new ValidationError({ message: (options.error_messages?.number?.negative ?? '').replaceAll('{path}', path), code: '', parts: { path } });
            } else if (equivalent.type === 'boolean') {
              if (typeof property !== 'boolean') throw new ValidationError({ message: (options.error_messages?.boolean?.type ?? '').replaceAll('{path}', path), code: '', parts: { path } });
            } else if (equivalent.type === 'date') {
              if (typeof property !== 'string' || typof(property)[1] !== 'date') throw new ValidationError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              const converted = date(property);

              this.update(converted);

              if (equivalent.min !== undefined) {
                const min_date = new Date(equivalent.min);

                if ((converted instanceof Date ? converted : new Date()).getTime() < min_date.getTime()) {
                  const part_min = equivalent.min;

                  throw new ValidationError({ message: (options.error_messages?.date?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', part_min), code: '', parts: { path, min: part_min } });
                }
              }

              if (equivalent.max !== undefined) {
                const max_date = new Date(equivalent.max);

                if ((converted instanceof Date ? converted : new Date()).getTime() > max_date.getTime()) {
                  const part_max = equivalent.max;

                  throw new ValidationError({ message: (options.error_messages?.date?.min ?? '').replaceAll('{path}', path).replaceAll('{max}', part_max), code: '', parts: { path, max: part_max } });
                }
              }
            } else if (equivalent.type === 'object') {
              if (typeof property !== 'object' || property === null || Array.isArray(property)) throw new ValidationError({ message: (options.error_messages?.object?.type ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            } else if (equivalent.type === 'array') {
              if (!Array.isArray(property)) throw new ValidationError({ message: (options.error_messages?.array?.type ?? '').replaceAll('{path}', path), code: '', parts: { path } });

              if (equivalent.min !== undefined && property.length < equivalent.min) {
                const part_min = String(equivalent.min);

                throw new ValidationError({ message: (options.error_messages?.array?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', part_min), code: '', parts: { path, min: part_min } });
              }

              if (equivalent.max !== undefined && property.length > equivalent.max) {
                const part_max = String(equivalent.max);

                throw new ValidationError({ message: (options.error_messages?.array?.max ?? '').replaceAll('{path}', path).replaceAll('{max}', part_max), code: '', parts: { path, max: part_max } });
              }
            }
          });

          resolve(properties);
        } catch (error) {
          if (error instanceof Error) {
            reject(error);
          } else reject(new Error(String(error)));
        }
      })();
    }, 0);
  });
};
