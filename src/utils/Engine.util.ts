import traverse from 'traverse';
import { typof, date } from 'typof';

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

const getSchema = (schema: Schema | Type, path_array: string[]): TypeSingle | undefined => {
  if (path_array.length === 0) {
    if (Array.isArray(schema)) return schema[0] as TypeSingle;

    if ('type' in schema) return schema as TypeSingle;

    return undefined;
  }

  const [key, ...rest_path] = path_array;

  if (Array.isArray(schema)) {
    for (const item of schema) {
      const result = getSchema(item, path_array);

      if (result !== undefined) return result;
    }

    return;
  }

  if ('type' in schema) {
    if (schema.type === 'object') return getSchema(schema.properties, path_array);

    if (schema.type === 'array') if (/^\d+$/.test(key)) return getSchema(schema.items, rest_path);

    return;
  }

  if (key in schema) return getSchema(schema[key], rest_path);

  return undefined;
};

export const validate = (schema: Schema, properties: UnknownObject, options: TeyitOptions) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        // eslint-disable-next-line no-restricted-syntax
        traverse(properties).forEach(function (property) {
          if (this.isRoot) return;

          const path = formatPath(this.path);
          const equivalent = getSchema(schema, this.path);

          if (!equivalent) {
            if (options.validate_options?.strip_unknown === true) this.delete();

            return;
          }

          if (property === null && !equivalent.nullable && equivalent.default !== null) throw new ValidationError({ message: (options.error_messages?.base?.nullable ?? '').replaceAll('{path}', path), code: '', parts: {} });

          if (property === undefined) {
            if (equivalent.default !== undefined) {
              this.update(equivalent.default);

              property = equivalent.default;
            } else if (equivalent.required) throw new ValidationError({ message: (options.error_messages?.base?.required ?? '').replaceAll('{path}', path), code: '', parts: {} });
          }

          if (equivalent.type === 'string') {
            if (typeof property !== 'string' || typof(property)[0] !== 'string') throw new ValidationError({ message: (options.error_messages?.string?.type ?? '').replaceAll('{path}', path), code: '', parts: {} });

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
              throw new ValidationError({ message: (options.error_messages?.string?.enum ?? '').replaceAll('{path}', path), code: '', parts: {} });

            if (equivalent.pattern !== undefined && !new RegExp(equivalent.pattern).test(property)) throw new ValidationError({ message: (options.error_messages?.string?.pattern ?? '').replaceAll('{path}', path), code: '', parts: {} });

            if (equivalent.min !== undefined && property.length < equivalent.min)
              throw new ValidationError({
                message: (options.error_messages?.string?.min ?? '')
                  .replaceAll('{path}', path)
                  .replaceAll('{min}', String(equivalent.min))
                  .replaceAll('{plural_suffix}', equivalent.min > 1 ? 's' : ''),
                code: '',
                parts: {}
              });

            if (equivalent.max !== undefined && property.length > equivalent.max)
              throw new ValidationError({
                message: (options.error_messages?.string?.max ?? '')
                  .replaceAll('{path}', path)
                  .replaceAll('{max}', String(equivalent.max))
                  .replaceAll('{plural_suffix}', equivalent.max > 1 ? 's' : ''),
                code: '',
                parts: {}
              });
          } else if (equivalent.type === 'number') {
            if (typeof property !== 'number' || typof(property)[0] !== 'number') throw new ValidationError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', path), code: '', parts: {} });

            if (equivalent.enum !== undefined && !equivalent.enum.includes(property)) throw new ValidationError({ message: (options.error_messages?.number?.enum ?? '').replaceAll('{path}', path), code: '', parts: {} });

            if (equivalent.min !== undefined && property < equivalent.min) throw new ValidationError({ message: (options.error_messages?.number?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', String(equivalent.min)), code: '', parts: {} });

            if (equivalent.max !== undefined && property > equivalent.max) throw new ValidationError({ message: (options.error_messages?.number?.max ?? '').replaceAll('{path}', path).replaceAll('{max}', String(equivalent.max)), code: '', parts: {} });

            if (equivalent.integer === true && !Number.isInteger(property)) throw new ValidationError({ message: (options.error_messages?.number?.integer ?? '').replaceAll('{path}', path), code: '', parts: {} });

            if (equivalent.positive === true && property < 0) throw new ValidationError({ message: (options.error_messages?.number?.positive ?? '').replaceAll('{path}', path), code: '', parts: {} });

            if (equivalent.negative === true && property >= 0) throw new ValidationError({ message: (options.error_messages?.number?.negative ?? '').replaceAll('{path}', path), code: '', parts: {} });
          } else if (equivalent.type === 'boolean') {
            if (typeof property !== 'boolean' || typof(property)[0] !== 'boolean') throw new ValidationError({ message: (options.error_messages?.boolean?.type ?? '').replaceAll('{path}', path), code: '', parts: {} });
          } else if (equivalent.type === 'date') {
            if (typeof property !== 'string' || typof(property)[1] !== 'date') throw new ValidationError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', path), code: '', parts: {} });

            const converted = date(property);

            this.update(converted);

            if (equivalent.min !== undefined) {
              const min_date = new Date(equivalent.min);

              if ((converted instanceof Date ? converted : new Date()).getTime() < min_date.getTime()) throw new ValidationError({ message: (options.error_messages?.date?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', equivalent.min), code: '', parts: {} });
            }

            if (equivalent.max !== undefined) {
              const max_date = new Date(equivalent.max);

              if ((converted instanceof Date ? converted : new Date()).getTime() > max_date.getTime()) throw new ValidationError({ message: (options.error_messages?.date?.min ?? '').replaceAll('{path}', path).replaceAll('{max}', equivalent.max), code: '', parts: {} });
            }
          } else if (equivalent.type === 'object') {
            if (typeof property !== 'object' || property === null || Array.isArray(property) || typof(property)[0] !== 'object') throw new ValidationError({ message: (options.error_messages?.object?.type ?? '').replaceAll('{path}', path), code: '', parts: {} });

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          } else if (equivalent.type === 'array') {
            if (!Array.isArray(property) || typof(property)[0] !== 'array') throw new ValidationError({ message: (options.error_messages?.array?.type ?? '').replaceAll('{path}', path), code: '', parts: {} });

            if (equivalent.min !== undefined && property.length < equivalent.min) throw new ValidationError({ message: (options.error_messages?.array?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', String(equivalent.min)), code: '', parts: {} });

            if (equivalent.max !== undefined && property.length > equivalent.max) throw new ValidationError({ message: (options.error_messages?.array?.max ?? '').replaceAll('{path}', path).replaceAll('{max}', String(equivalent.max)), code: '', parts: {} });
          }
        });

        resolve(properties);
      } catch (error) {
        if (error instanceof Error) {
          reject(error);
        } else reject(new Error(String(error)));
      }
    }, 0);
  });
};
