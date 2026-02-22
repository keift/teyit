import traverse from 'traverse';
import { typof, date } from 'typof';
import sortkeys from 'sort-keys';

import type { InferSchema } from '../main';
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

export const validate = async <const _Schema extends Schema>(schema: _Schema, properties: UnknownObject, options: TeyitOptions): Promise<InferSchema<_Schema>> => {
  if (Array.isArray(schema)) {
    const schema_union = schema as Record<string, Type>[];

    let last_error = new Error();

    for (const schema_single of schema_union) {
      try {
        const properties_clone = (properties);

        const valid_properties = await validate(schema_single, properties_clone, options);

        return valid_properties as InferSchema<_Schema>;
      } catch (error) {
        last_error = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw last_error;
  }

  const properties_clone = (properties);

  seedMissingProperties(schema, properties_clone);

  const collected_errors: { message: string; parts: Record<string, string> }[] = [];

  const reportError = (error: { message: string; parts: Record<string, string> }) => {
    if (options.validation?.abort_early === false) {
      collected_errors.push(error);
    } else throw new ValidationError({ errors: [error] });
  };

  // eslint-disable-next-line no-restricted-syntax
  traverse(properties_clone).forEach(function (property) {
    if (this.isRoot) return;

    const path = formatPath(this.path);
    const equivalent = getSchema(schema, this.path, property);

    if (!equivalent) {
      if (options.validation?.strip_unknown === true) this.delete();

      return;
    }

    if (property === null) {
      if (!equivalent.nullable && equivalent.default !== null) reportError({ message: (options.error_messages?.base?.nullable ?? '').replaceAll('{path}', path), parts: { path } });

      return;
    }

    if (property === undefined) {
      if (equivalent.default !== undefined) {
        this.update(equivalent.default);
        property = equivalent.default;
      } else if (equivalent.required) {
        reportError({ message: (options.error_messages?.base?.required ?? '').replaceAll('{path}', path), parts: { path } });

        return;
      } else return;
    }

    if (equivalent.type === 'string') {
      if (typeof property !== 'string') {
        reportError({ message: (options.error_messages?.string?.type ?? '').replaceAll('{path}', path), parts: { path } });

        return;
      }

      if (equivalent.trim !== false) this.update(property.trim());
      if (equivalent.lowercase === true) this.update(property.toLowerCase());
      if (equivalent.uppercase === true) this.update(property.toUpperCase());

      if (equivalent.enum !== undefined) {
        const passed = equivalent.enum.some((item) => {
          if (equivalent.trim !== false) item = item.trim();
          if (equivalent.lowercase === true) item = item.toLowerCase();
          if (equivalent.uppercase === true) item = item.toUpperCase();

          return item === property;
        });

        if (!passed) reportError({ message: (options.error_messages?.string?.enum ?? '').replaceAll('{path}', path), parts: { path } });
      }

      if (equivalent.pattern !== undefined && !new RegExp(equivalent.pattern).test(property)) {
        const pattern = equivalent.pattern ? new RegExp(equivalent.pattern).source : '';

        reportError({ message: (options.error_messages?.string?.pattern ?? '').replaceAll('{path}', path).replaceAll('{pattern}', pattern), parts: { path, pattern } });
      }

      if (equivalent.min !== undefined && property.length < equivalent.min) {
        const part_min = String(equivalent.min);
        const plural_suffix = equivalent.min > 1 ? 's' : '';

        reportError({ message: (options.error_messages?.string?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', part_min).replaceAll('{plural_suffix}', plural_suffix), parts: { path, min: part_min, plural_suffix } });
      }

      if (equivalent.max !== undefined && property.length > equivalent.max) {
        const part_max = String(equivalent.max);
        const plural_suffix = equivalent.max > 1 ? 's' : '';

        reportError({ message: (options.error_messages?.string?.max ?? '').replaceAll('{path}', path).replaceAll('{max}', part_max).replaceAll('{plural_suffix}', plural_suffix), parts: { path, max: part_max, plural_suffix } });
      }
    } else if (equivalent.type === 'number') {
      if (typeof property !== 'number') {
        reportError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', path), parts: { path } });

        return;
      }

      if (equivalent.enum !== undefined && !equivalent.enum.includes(property)) reportError({ message: (options.error_messages?.number?.enum ?? '').replaceAll('{path}', path), parts: { path } });

      if (equivalent.min !== undefined && property < equivalent.min) {
        const part_min = String(equivalent.min);

        reportError({ message: (options.error_messages?.number?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', part_min), parts: { path, min: part_min } });
      }

      if (equivalent.max !== undefined && property > equivalent.max) {
        const part_max = String(equivalent.max);

        reportError({ message: (options.error_messages?.number?.max ?? '').replaceAll('{path}', path).replaceAll('{max}', part_max), parts: { path, max: part_max } });
      }

      if (equivalent.integer === true && !Number.isInteger(property)) reportError({ message: (options.error_messages?.number?.integer ?? '').replaceAll('{path}', path), parts: { path } });

      if (equivalent.positive === true && property < 0) reportError({ message: (options.error_messages?.number?.positive ?? '').replaceAll('{path}', path), parts: { path } });

      if (equivalent.negative === true && property >= 0) reportError({ message: (options.error_messages?.number?.negative ?? '').replaceAll('{path}', path), parts: { path } });
    } else if (equivalent.type === 'boolean') {
      if (typeof property !== 'boolean') reportError({ message: (options.error_messages?.boolean?.type ?? '').replaceAll('{path}', path), parts: { path } });
    } else if (equivalent.type === 'date') {
      if (typeof property !== 'string' || typof(property)[1] !== 'date') {
        reportError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', path), parts: { path } });

        return;
      }

      const converted = date(property);

      this.update(converted);

      if (equivalent.min !== undefined) {
        const min_date = new Date(equivalent.min);

        if ((converted instanceof Date ? converted : new Date()).getTime() < min_date.getTime()) {
          const part_min = equivalent.min;

          reportError({ message: (options.error_messages?.date?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', part_min), parts: { path, min: part_min } });
        }
      }

      if (equivalent.max !== undefined) {
        const max_date = new Date(equivalent.max);

        if ((converted instanceof Date ? converted : new Date()).getTime() > max_date.getTime()) {
          const part_max = equivalent.max;

          reportError({ message: (options.error_messages?.date?.min ?? '').replaceAll('{path}', path).replaceAll('{max}', part_max), parts: { path, max: part_max } });
        }
      }
    } else if (equivalent.type === 'object') {
      if (typeof property !== 'object' || property === null || Array.isArray(property)) reportError({ message: (options.error_messages?.object?.type ?? '').replaceAll('{path}', path), parts: { path } });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (equivalent.type === 'array') {
      if (!Array.isArray(property)) {
        reportError({ message: (options.error_messages?.array?.type ?? '').replaceAll('{path}', path), parts: { path } });

        return;
      }

      if (equivalent.min !== undefined && property.length < equivalent.min) {
        const part_min = String(equivalent.min);

        reportError({ message: (options.error_messages?.array?.min ?? '').replaceAll('{path}', path).replaceAll('{min}', part_min), parts: { path, min: part_min } });
      }

      if (equivalent.max !== undefined && property.length > equivalent.max) {
        const part_max = String(equivalent.max);

        reportError({ message: (options.error_messages?.array?.max ?? '').replaceAll('{path}', path).replaceAll('{max}', part_max), parts: { path, max: part_max } });
      }
    }
  });

  if (collected_errors.length > 0) throw new ValidationError({ errors: collected_errors });

  return (options.validation?.sort_keys === true ? sortkeys(properties_clone, { deep: true }) : properties_clone) as InferSchema<_Schema>;
};
