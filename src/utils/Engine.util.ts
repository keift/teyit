import { typof, date } from 'typof';
import sortkeys from 'sort-keys';

import type { InferSchema } from '../types/InferSchema.type';
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

const regexes = new Map<string, RegExp>();

const getRegex = (pattern: string) => {
  let regex = regexes.get(pattern);

  if (!regex) {
    regex = new RegExp(pattern);

    regexes.set(pattern, regex);
  }

  return regex;
};

const findMatchedSchema = (schemaUnion: TypeSingle[], property: unknown) => {
  const matched = schemaUnion.find((schema) => {
    if (property === null) return schema.nullable;

    if (schema.type === 'date') return typeof property === 'string' || property instanceof Date;
    if (schema.type === 'array') return Array.isArray(property);
    if (schema.type === 'object') return typeof property === 'object' && !Array.isArray(property);

    return typeof property === schema.type;
  });

  return matched ?? schemaUnion[0];
};

export const validate = async <const _Schema extends Schema>(schema: _Schema, properties: UnknownObject, options: TeyitOptions): Promise<InferSchema<_Schema>> => {
  if (Array.isArray(schema)) {
    const schema_union = schema as Record<string, Type>[];

    let last_error = new Error();

    for (const schema_single of schema_union) {
      try {
        const valid_properties = await validate(schema_single as unknown as _Schema, properties, options);

        return valid_properties;
      } catch (error) {
        last_error = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw last_error;
  }

  const collected_errors: { message: string; parts: Record<string, string> }[] = [];

  const reportError = (error: { message: string; parts: Record<string, string> }) => {
    if (options.validation?.abort_early === false) {
      collected_errors.push(error);
    } else throw new ValidationError({ errors: [error] });
  };

  const processProperty = (equivalent: TypeSingle, property: unknown, path: string[]): unknown => {
    const getPath = () => formatPath(path);

    if (property === undefined) {
      if (equivalent.default !== undefined) {
        return equivalent.default;
      } else if (equivalent.required) {
        reportError({ message: (options.error_messages?.base?.required ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

        return;
      }

      return;
    }

    if (property === null) {
      if (!equivalent.nullable && equivalent.default !== null) reportError({ message: (options.error_messages?.base?.nullable ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

      return property;
    }

    if (equivalent.type === 'string') {
      if (typeof property !== 'string') {
        reportError({ message: (options.error_messages?.string?.type ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

        return property;
      }

      let value = property;

      if (equivalent.trim !== false) value = value.trim();
      if (equivalent.lowercase === true) value = value.toLowerCase();
      if (equivalent.uppercase === true) value = value.toUpperCase();

      if (equivalent.enum !== undefined) {
        const passed = equivalent.enum.some((item) => {
          let parsed = item;

          if (equivalent.trim !== false) parsed = parsed.trim();
          if (equivalent.lowercase === true) parsed = parsed.toLowerCase();
          if (equivalent.uppercase === true) parsed = parsed.toUpperCase();

          return parsed === value;
        });

        if (!passed) reportError({ message: (options.error_messages?.string?.enum ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });
      }

      if (equivalent.pattern !== undefined) {
        const regex = getRegex(equivalent.pattern);

        if (!regex.test(value)) reportError({ message: (options.error_messages?.string?.pattern ?? '').replaceAll('{path}', getPath()).replaceAll('{pattern}', equivalent.pattern), parts: { path: getPath(), pattern: equivalent.pattern } });
      }

      if (equivalent.min !== undefined && value.length < equivalent.min) {
        const part_min = String(equivalent.min);
        const plural_suffix = equivalent.min > 1 ? 's' : '';

        reportError({ message: (options.error_messages?.string?.min ?? '').replaceAll('{path}', getPath()).replaceAll('{min}', part_min).replaceAll('{plural_suffix}', plural_suffix), parts: { path: getPath(), min: part_min, plural_suffix } });
      }

      if (equivalent.max !== undefined && value.length > equivalent.max) {
        const part_max = String(equivalent.max);
        const plural_suffix = equivalent.max > 1 ? 's' : '';

        reportError({ message: (options.error_messages?.string?.max ?? '').replaceAll('{path}', getPath()).replaceAll('{max}', part_max).replaceAll('{plural_suffix}', plural_suffix), parts: { path: getPath(), max: part_max, plural_suffix } });
      }

      return value;
    } else if (equivalent.type === 'number') {
      if (typeof property !== 'number') {
        reportError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

        return property;
      }

      if (equivalent.enum !== undefined && !equivalent.enum.includes(property)) reportError({ message: (options.error_messages?.number?.enum ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

      if (equivalent.min !== undefined && property < equivalent.min) reportError({ message: (options.error_messages?.number?.min ?? '').replaceAll('{path}', getPath()).replaceAll('{min}', String(equivalent.min)), parts: { path: getPath(), min: String(equivalent.min) } });

      if (equivalent.max !== undefined && property > equivalent.max) reportError({ message: (options.error_messages?.number?.max ?? '').replaceAll('{path}', getPath()).replaceAll('{max}', String(equivalent.max)), parts: { path: getPath(), max: String(equivalent.max) } });

      if (equivalent.integer === true && !Number.isInteger(property)) reportError({ message: (options.error_messages?.number?.integer ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });
      if (equivalent.positive === true && property < 0) reportError({ message: (options.error_messages?.number?.positive ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });
      if (equivalent.negative === true && property >= 0) reportError({ message: (options.error_messages?.number?.negative ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

      return property;
    } else if (equivalent.type === 'boolean') {
      if (typeof property !== 'boolean') reportError({ message: (options.error_messages?.boolean?.type ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

      return property;
    } else if (equivalent.type === 'date') {
      if (typeof property !== 'string' && typof(property)[1] !== 'date') {
        reportError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

        return property;
      }

      const converted = date(property);

      if (!(converted instanceof Date)) {
        reportError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

        return property;
      }

      if (equivalent.min !== undefined) {
        const min_date = new Date(equivalent.min);

        if ((converted instanceof Date ? converted : new Date()).getTime() < min_date.getTime()) reportError({ message: (options.error_messages?.date?.min ?? '').replaceAll('{path}', getPath()).replaceAll('{min}', equivalent.min), parts: { path: getPath(), min: equivalent.min } });
      }

      if (equivalent.max !== undefined) {
        const max_date = new Date(equivalent.max);

        if ((converted instanceof Date ? converted : new Date()).getTime() > max_date.getTime()) reportError({ message: (options.error_messages?.date?.max ?? options.error_messages?.date?.min ?? '').replaceAll('{path}', getPath()).replaceAll('{max}', equivalent.max), parts: { path: getPath(), max: equivalent.max } });
      }

      return converted;
    } else if (equivalent.type === 'object') {
      if (typeof property !== 'object' || Array.isArray(property)) {
        reportError({ message: (options.error_messages?.object?.type ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

        return property;
      }

      const result_record: Record<string, unknown> = {};

      const schema_record = 'properties' in equivalent ? (equivalent.properties as Record<string, Type>) : {};
      const property_record = property as Record<string, unknown>;

      for (const key of Object.keys(schema_record)) {
        const schema_property = schema_record[key];
        const target_schema = Array.isArray(schema_property) ? findMatchedSchema(schema_property, property_record[key]) : schema_property;

        const value = processProperty(target_schema, property_record[key], [...path, key]);

        if (value !== undefined) result_record[key] = value;
      }

      if (options.validation?.strip_unknown !== true) for (const key of Object.keys(property_record)) if (!(key in schema_record)) result_record[key] = property_record[key];

      return result_record;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (equivalent.type === 'array') {
      if (!Array.isArray(property)) {
        reportError({ message: (options.error_messages?.array?.type ?? '').replaceAll('{path}', getPath()), parts: { path: getPath() } });

        return property;
      }

      if (equivalent.min !== undefined && property.length < equivalent.min) reportError({ message: (options.error_messages?.array?.min ?? '').replaceAll('{path}', getPath()).replaceAll('{min}', String(equivalent.min)), parts: { path: getPath(), min: String(equivalent.min) } });

      if (equivalent.max !== undefined && property.length > equivalent.max) reportError({ message: (options.error_messages?.array?.max ?? '').replaceAll('{path}', getPath()).replaceAll('{max}', String(equivalent.max)), parts: { path: getPath(), max: String(equivalent.max) } });

      const schema_item = 'items' in equivalent ? (equivalent.items as TypeSingle | TypeSingle[]) : (equivalent as TypeSingle);
      const results_array = new Array(property.length);

      for (let i = 0; i < property.length; i++) {
        const target_schema = Array.isArray(schema_item) ? findMatchedSchema(schema_item, property[i]) : schema_item;

        results_array[i] = processProperty(target_schema, property[i], [...path, String(i)]);
      }

      return results_array;
    }

    return property;
  };

  let result: unknown;

  try {
    if (typeof schema === 'object' && !('type' in schema)) {
      if (typeof properties !== 'object' || Array.isArray(properties)) throw new ValidationError({ errors: [{ message: (options.error_messages?.object?.type ?? '').replaceAll('{path}', 'root'), parts: { path: 'root' } }] });

      const result_record: Record<string, unknown> = {};

      const schema_record = schema as Record<string, Type>;
      const properties_record = properties as Record<string, unknown>;

      for (const key of Object.keys(schema_record)) {
        const schema_property = schema_record[key];
        const target_schema = Array.isArray(schema_property) ? findMatchedSchema(schema_property, properties_record[key]) : schema_property;

        const value = processProperty(target_schema, properties_record[key], [key]);

        if (value !== undefined) result_record[key] = value;
      }

      if (options.validation?.strip_unknown !== true) for (const key of Object.keys(properties_record)) if (!(key in schema_record)) result_record[key] = properties_record[key];

      result = result_record;
    } else {
      const target_schema = Array.isArray(schema) ? findMatchedSchema(schema as unknown as TypeSingle[], properties) : (schema as unknown as TypeSingle);

      result = processProperty(target_schema, properties, []);
    }

    if (collected_errors.length > 0) throw new ValidationError({ errors: collected_errors });

    if (options.validation?.sort_keys === true) result = sortkeys(result as Record<string, unknown>, { deep: true });

    return result as InferSchema<_Schema>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;

    throw new Error(String(error), { cause: error });
  }
};
