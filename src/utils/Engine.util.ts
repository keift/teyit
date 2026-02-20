import traverse from 'traverse';
import { typof } from 'typof';

import type { Schema, Type, TypeSingle } from '../types/Schema.type';
import type { TeyitOptions } from '../types/TeyitOptions.type';
import type { UnknownObject } from '../types/UnknownObject.type';

const formatPath = (path_array: string[]) =>
  path_array.reduce((acc, key) => {
    if (/^\d+$/.test(key)) return `${acc}[${key}]`;

    if (acc === '') return key;

    return `${acc}.${key}`;
  }, '');

const getSchema = (current_schema: Schema | Type, path_array: string[]): TypeSingle | undefined => {
  if (path_array.length === 0) {
    if (Array.isArray(current_schema)) return current_schema[0] as TypeSingle;

    if ('type' in current_schema) return current_schema as TypeSingle;

    return undefined;
  }

  const [key, ...restPath] = path_array;

  if (Array.isArray(current_schema)) {
    for (const item of current_schema) {
      const result = getSchema(item, path_array);

      if (result !== undefined) return result;
    }

    return undefined;
  }

  if ('type' in current_schema) {
    if (current_schema.type === 'object') return getSchema(current_schema.properties, path_array);

    if (current_schema.type === 'array') if (/^\d+$/.test(key)) return getSchema(current_schema.items, restPath);

    return undefined;
  }

  if (key in current_schema) return getSchema(current_schema[key], restPath);

  return undefined;
};

export const validate = (schema: Schema, properties: UnknownObject, options: TeyitOptions): Promise<UnknownObject> => {
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

          if (equivalent.type === 'string') {
            if (typeof property !== 'string') throw new Error((options.error_messages?.string?.type ?? '').replaceAll('{path}', path));

            if (equivalent.enum !== undefined && !equivalent.enum.includes(property)) throw new Error((options.error_messages?.string?.enum ?? '').replaceAll('{path}', path));
          }
        });

        resolve(properties);
      } catch (error) {
        if (error instanceof Error) {
          reject(error);
        } else {
          reject(new Error(String(error)));
        }
      }
    }, 0);
  });
};
