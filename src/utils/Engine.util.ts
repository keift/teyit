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

const getSchema = (schema: Schema | Type, path_array: string[], current_value?: unknown): TypeSingle | undefined => {
  if (path_array.length === 0) {
    if (Array.isArray(schema)) {
      if (current_value === undefined) return schema[0] as TypeSingle;

      const matched = schema.find((s) => {
        const rule = s as TypeSingle;
        if (current_value === null) return rule.nullable;

        if (rule.type === 'array') return Array.isArray(current_value);
        if (rule.type === 'object') return typeof current_value === 'object' && !Array.isArray(current_value);
        if (rule.type === 'date') return typeof current_value === 'string' || current_value instanceof Date;

        return typeof current_value === rule.type;
      });

      return (matched ?? schema[0]) as TypeSingle;
    }

    if (typeof schema === 'object' && 'type' in schema) return schema as TypeSingle;

    return undefined;
  }

  const [key, ...rest_path] = path_array;

  if (Array.isArray(schema)) {
    for (const item of schema) {
      const result = getSchema(item, path_array, current_value);

      if (result !== undefined) return result;
    }

    return;
  }

  if (typeof schema === 'object') {
    if ('type' in schema) {
      if (schema.type === 'object' && 'properties' in schema) {
        return getSchema(schema.properties, path_array, current_value);
      }

      // Dizi ise ve items varsa
      if (schema.type === 'array' && 'items' in schema) {
        if (/^\d+$/.test(key)) return getSchema(schema.items, rest_path, current_value);
      }

      return undefined;
    }

    const schema_record = schema as Record<string, Type>;
    if (key in schema_record) {
      return getSchema(schema_record[key], rest_path, current_value);
    }
  }

  return undefined;
};

const seedMissingProperties = (current_schema: unknown, current_data: unknown): void => {
  if (typeof current_schema !== 'object' || current_schema === null || Array.isArray(current_schema)) return;
  if (typeof current_data !== 'object' || current_data === null || Array.isArray(current_data)) return;

  const schema_record = current_schema as Record<string, unknown>;
  const data_record = current_data as Record<string, unknown>;

  for (const key of Object.keys(schema_record)) {
    const rule = schema_record[key];

    if (!(key in data_record)) {
      data_record[key] = undefined;
    }

    if (rule !== null && typeof rule === 'object' && !Array.isArray(rule) && 'type' in rule && rule.type === 'object' && 'properties' in rule && data_record[key] !== null && typeof data_record[key] === 'object' && !Array.isArray(data_record[key])) {
      seedMissingProperties(rule.properties, data_record[key]);
    }
  }
};

export const validate = (schema: Schema, properties: UnknownObject, options: TeyitOptions) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      void (async () => {
        if (Array.isArray(schema) && schema.length > 0 && typeof schema[0] === 'object' && !('type' in schema[0])) {
          const schema_union = schema as Record<string, Type>[];
          let last_error: Error | null = null;
          let is_valid = false;

          for (const single_schema of schema_union) {
            try {
              // Şemanın her bir varyantı için, objenin kopyası üzerinden test yapıyoruz
              // (Eğer obje pass olursa orjinalini değil, başarıyla parse edilmiş kopyasını dönmeliyiz)
              const properties_clone = JSON.parse(JSON.stringify(properties));

              // Kendi içinde recursive olarak validate'i çağırıp tekil şema gibi test ediyoruz
              const valid_properties = await validate(single_schema as Schema, properties_clone, options);

              // Eğer buraya ulaştıysa, şema varyantlarından birinden BAŞARIYLA GEÇTİ demektir!
              is_valid = true;
              resolve(valid_properties as UnknownObject);
              return; // Diğer varyantları test etmeye gerek kalmadı
            } catch (error) {
              // Hata aldıysa bu varyant uymadı demektir, hatayı sakla ve bir sonraki varyantı dene
              last_error = error instanceof Error ? error : new Error(String(error));
            }
          }

          // Eğer döngü bittiğinde is_valid false ise, hiçbir union varyantına uymamış demektir.
          if (!is_valid) {
            reject(last_error ?? new ValidationError({ message: 'No matching schema found in union.', code: 'UNION_FAIL', parts: {} }));
          }
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
