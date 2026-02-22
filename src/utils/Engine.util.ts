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

const regexCache = new Map<string, RegExp>();
const getRegex = (pattern: string) => {
  let regex = regexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(pattern);
    regexCache.set(pattern, regex);
  }
  return regex;
};

const findMatchedSchema = (schemaUnion: TypeSingle[], property: unknown): TypeSingle => {
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
    } else {
      throw new ValidationError({ errors: [error] });
    }
  };

  const processField = (equivalent: TypeSingle, property: unknown, path: string[]): unknown => {
    const getPathStr = () => formatPath(path);

    if (property === undefined) {
      if (equivalent.default !== undefined) {
        return equivalent.default;
      } else if (equivalent.required) {
        reportError({ message: (options.error_messages?.base?.required ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
        return undefined;
      }
      return undefined;
    }

    if (property === null) {
      if (!equivalent.nullable && equivalent.default !== null) {
        reportError({ message: (options.error_messages?.base?.nullable ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
      }
      return property;
    }

    if (equivalent.type === 'string') {
      if (typeof property !== 'string') {
        reportError({ message: (options.error_messages?.string?.type ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
        return property;
      }

      let value = property;
      if (equivalent.trim !== false) value = value.trim();
      if (equivalent.lowercase === true) value = value.toLowerCase();
      if (equivalent.uppercase === true) value = value.toUpperCase();

      if (equivalent.enum !== undefined) {
        const isValidEnum = equivalent.enum.some((item) => {
          let parsedItem = item;
          if (equivalent.trim !== false) parsedItem = parsedItem.trim();
          if (equivalent.lowercase === true) parsedItem = parsedItem.toLowerCase();
          if (equivalent.uppercase === true) parsedItem = parsedItem.toUpperCase();
          return parsedItem === value;
        });

        if (!isValidEnum) reportError({ message: (options.error_messages?.string?.enum ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
      }

      if (equivalent.pattern !== undefined) {
        const regex = getRegex(equivalent.pattern);
        if (!regex.test(value)) {
          reportError({ message: (options.error_messages?.string?.pattern ?? '').replaceAll('{path}', getPathStr()).replaceAll('{pattern}', equivalent.pattern), parts: { path: getPathStr(), pattern: equivalent.pattern } });
        }
      }

      if (equivalent.min !== undefined && value.length < equivalent.min) {
        const part_min = String(equivalent.min);
        const plural_suffix = equivalent.min > 1 ? 's' : '';
        reportError({ message: (options.error_messages?.string?.min ?? '').replaceAll('{path}', getPathStr()).replaceAll('{min}', part_min).replaceAll('{plural_suffix}', plural_suffix), parts: { path: getPathStr(), min: part_min, plural_suffix } });
      }

      if (equivalent.max !== undefined && value.length > equivalent.max) {
        const part_max = String(equivalent.max);
        const plural_suffix = equivalent.max > 1 ? 's' : '';
        reportError({ message: (options.error_messages?.string?.max ?? '').replaceAll('{path}', getPathStr()).replaceAll('{max}', part_max).replaceAll('{plural_suffix}', plural_suffix), parts: { path: getPathStr(), max: part_max, plural_suffix } });
      }

      return value;
    } else if (equivalent.type === 'number') {
      if (typeof property !== 'number') {
        reportError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
        return property;
      }

      if (equivalent.enum !== undefined && !equivalent.enum.includes(property)) {
        reportError({ message: (options.error_messages?.number?.enum ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
      }

      if (equivalent.min !== undefined && property < equivalent.min) {
        reportError({ message: (options.error_messages?.number?.min ?? '').replaceAll('{path}', getPathStr()).replaceAll('{min}', String(equivalent.min)), parts: { path: getPathStr(), min: String(equivalent.min) } });
      }

      if (equivalent.max !== undefined && property > equivalent.max) {
        reportError({ message: (options.error_messages?.number?.max ?? '').replaceAll('{path}', getPathStr()).replaceAll('{max}', String(equivalent.max)), parts: { path: getPathStr(), max: String(equivalent.max) } });
      }

      if (equivalent.integer === true && !Number.isInteger(property)) reportError({ message: (options.error_messages?.number?.integer ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
      if (equivalent.positive === true && property < 0) reportError({ message: (options.error_messages?.number?.positive ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
      if (equivalent.negative === true && property >= 0) reportError({ message: (options.error_messages?.number?.negative ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });

      return property;
    } else if (equivalent.type === 'boolean') {
      if (typeof property !== 'boolean') reportError({ message: (options.error_messages?.boolean?.type ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
      return property;
    } else if (equivalent.type === 'date') {
      if (typeof property !== 'string' && typof(property)[1] !== 'date') {
        reportError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
        return property;
      }

      const converted = date(property as string | Date);
      if (!(converted instanceof Date)) {
        reportError({ message: (options.error_messages?.number?.type ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
        return property;
      }

      if (equivalent.min !== undefined) {
        const min_date = new Date(equivalent.min);
        if ((converted instanceof Date ? converted : new Date()).getTime() < min_date.getTime()) {
          reportError({ message: (options.error_messages?.date?.min ?? '').replaceAll('{path}', getPathStr()).replaceAll('{min}', equivalent.min), parts: { path: getPathStr(), min: equivalent.min } });
        }
      }

      if (equivalent.max !== undefined) {
        const max_date = new Date(equivalent.max);
        if ((converted instanceof Date ? converted : new Date()).getTime() > max_date.getTime()) {
          reportError({ message: (options.error_messages?.date?.max ?? options.error_messages?.date?.min ?? '').replaceAll('{path}', getPathStr()).replaceAll('{max}', equivalent.max), parts: { path: getPathStr(), max: equivalent.max } });
        }
      }

      return converted;
    } else if (equivalent.type === 'object') {
      if (typeof property !== 'object' || Array.isArray(property)) {
        reportError({ message: (options.error_messages?.object?.type ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
        return property;
      }

      const resultObj: Record<string, unknown> = {};

      // ANY KULLANILMADAN TYPE GUARD İLE ÇÖZÜM
      const schemaProps = 'properties' in equivalent ? (equivalent.properties as Record<string, Type>) : {};
      const propObj = property as Record<string, unknown>;

      for (const key of Object.keys(schemaProps)) {
        const propSchema = schemaProps[key];
        const targetSchema = Array.isArray(propSchema) ? findMatchedSchema(propSchema, propObj[key]) : propSchema;

        const val = processField(targetSchema, propObj[key], [...path, key]);
        if (val !== undefined) resultObj[key] = val;
      }

      if (options.validation?.strip_unknown !== true) {
        for (const key of Object.keys(propObj)) {
          if (!(key in schemaProps)) resultObj[key] = propObj[key];
        }
      }

      return resultObj;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (equivalent.type === 'array') {
      if (!Array.isArray(property)) {
        reportError({ message: (options.error_messages?.array?.type ?? '').replaceAll('{path}', getPathStr()), parts: { path: getPathStr() } });
        return property;
      }

      if (equivalent.min !== undefined && property.length < equivalent.min) {
        reportError({ message: (options.error_messages?.array?.min ?? '').replaceAll('{path}', getPathStr()).replaceAll('{min}', String(equivalent.min)), parts: { path: getPathStr(), min: String(equivalent.min) } });
      }

      if (equivalent.max !== undefined && property.length > equivalent.max) {
        reportError({ message: (options.error_messages?.array?.max ?? '').replaceAll('{path}', getPathStr()).replaceAll('{max}', String(equivalent.max)), parts: { path: getPathStr(), max: String(equivalent.max) } });
      }

      // ANY KULLANILMADAN TYPE GUARD İLE ÇÖZÜM
      const itemSchema = 'items' in equivalent ? (equivalent.items as TypeSingle | TypeSingle[]) : (equivalent as TypeSingle);
      const resultArray = new Array(property.length);

      for (let i = 0; i < property.length; i++) {
        const targetSchema = Array.isArray(itemSchema) ? findMatchedSchema(itemSchema, property[i]) : itemSchema;
        resultArray[i] = processField(targetSchema, property[i], [...path, String(i)]);
      }

      return resultArray;
    }

    return property;
  };

  let finalResult: unknown;

  try {
    if (typeof schema === 'object' && !('type' in schema)) {
      if (typeof properties !== 'object' || Array.isArray(properties)) {
        throw new ValidationError({ errors: [{ message: (options.error_messages?.object?.type ?? '').replaceAll('{path}', 'root'), parts: { path: 'root' } }] });
      }

      const resultObj: Record<string, unknown> = {};
      const schemaRecord = schema as Record<string, Type>;
      const propObj = properties as Record<string, unknown>;

      for (const key of Object.keys(schemaRecord)) {
        const fieldSchema = schemaRecord[key];
        const targetSchema = Array.isArray(fieldSchema) ? findMatchedSchema(fieldSchema, propObj[key]) : fieldSchema;

        const val = processField(targetSchema, propObj[key], [key]);
        if (val !== undefined) resultObj[key] = val;
      }

      if (options.validation?.strip_unknown !== true) {
        for (const key of Object.keys(propObj)) {
          if (!(key in schemaRecord)) resultObj[key] = propObj[key];
        }
      }

      finalResult = resultObj;
    } else {
      const targetSchema = Array.isArray(schema) ? findMatchedSchema(schema as unknown as TypeSingle[], properties) : (schema as unknown as TypeSingle);
      finalResult = processField(targetSchema, properties, []);
    }

    if (collected_errors.length > 0) throw new ValidationError({ errors: collected_errors });

    if (options.validation?.sort_keys === true) {
      finalResult = sortkeys(finalResult as Record<string, unknown>, { deep: true });
    }

    return finalResult as InferSchema<_Schema>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new Error(String(error), { cause: error });
  }
};
