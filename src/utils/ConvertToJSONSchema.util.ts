import { Type as Typebox } from '@sinclair/typebox';

import type { JSONSchema } from '../types/JSONSchema.type';
import type { Schema, SchemaSingle, SchemaUnion, Type, TypeSingle, TypeUnion } from '../types/Schema.type';
import type { TeyitOptions } from '../types/TeyitOptions.type';

export const convertToJSONSchema = (schema: Schema, options: TeyitOptions) => {
  const typeBase = (schema: JSONSchema, key: string, config: TypeSingle) => {
    if (config.nullable || config.default === null) schema = Typebox.Union([schema, Typebox.Null()]);

    if (!config.required) schema = Typebox.Optional(schema);

    return schema;
  };

  const buildTypeSingle = (key: string, config: TypeSingle) => {
    if (config.type === 'string') {
      let schema: JSONSchema = Typebox.String({ enum: config.enum, minLength: config.min, maxLength: config.max, pattern: config.pattern !== undefined ? new RegExp(config.pattern).source : undefined, trim: config.trim === false ? false : true, lowercase: config.lowercase, uppercase: config.lowercase, default: config.default });

      schema = typeBase(schema, key, config);

      return schema;
    } else if (config.type === 'number') {
      let minimum = config.min;
      let exclusive_maximum;

      if (config.positive === true && config.min === undefined) minimum = 0;

      if (config.negative === true && config.max === undefined) exclusive_maximum = 0;

      let schema: JSONSchema = config.integer === true ? Typebox.Integer({ enum: config.enum, minimum, maximum: config.max, exclusiveMaximum: exclusive_maximum, default: config.default }) : Typebox.Number({ enum: config.enum, minimum, maximum: config.max, exclusiveMaximum: exclusive_maximum, default: config.default });

      schema = typeBase(schema, key, config);

      return schema;
    } else if (config.type === 'boolean') {
      let schema: JSONSchema = Typebox.Boolean({ default: config.default });

      schema = typeBase(schema, key, config);

      return schema;
    } else if (config.type === 'date') {
      let schema: JSONSchema = Typebox.String({ format: 'date-time', formatMinimum: config.min !== undefined ? new Date(config.min).toISOString() : undefined, formatMaximum: config.max !== undefined ? new Date(config.max).toISOString() : undefined, default: config.default });

      schema = typeBase(schema, key, config);

      return schema;
    } else if (config.type === 'object') {
      let schema: JSONSchema;

      if (Array.isArray(config.properties)) {
        const schemas = config.properties.map((schemaSingle) => {
          const nested_properties: Record<string, JSONSchema> = {};

          for (const [nested_key, nested_config] of Object.entries(schemaSingle)) nested_properties[nested_key] = buildType(nested_key, nested_config);

          return Typebox.Object(nested_properties, { additionalProperties: !(options.validate_options?.strip_unknown ?? false) });
        });

        schema = Typebox.Union(schemas, { default: config.default });
      } else {
        const nested_properties: Record<string, JSONSchema> = {};

        for (const [nested_key, nested_config] of Object.entries(config.properties)) nested_properties[nested_key] = buildType(nested_key, nested_config);

        schema = Typebox.Object(nested_properties, { default: config.default, additionalProperties: !(options.validate_options?.strip_unknown ?? false) });
      }

      schema = typeBase(schema, key, config);

      return schema;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (config.type === 'array') {
      let schema: JSONSchema = Typebox.Array(buildType(key, config.items), { minItems: config.min, maxItems: config.max, default: config.default });

      schema = typeBase(schema, key, config);

      return schema;
    } else throw new Error(`Invalid schema type for ${key}`);
  };

  const buildTypeUnion = (key: string, config: TypeUnion) => {
    const schemas = config.map((config) => buildTypeSingle(key, config));

    const optional = config.every((config) => !config.required);

    const union_schema = Typebox.Union(schemas);

    return optional ? Typebox.Optional(union_schema) : union_schema;
  };

  const buildType = (key: string, config: Type) => {
    if (Array.isArray(config)) {
      return buildTypeUnion(key, config);
    } else return buildTypeSingle(key, config);
  };

  const buildSchemaSingle = (schema: SchemaSingle) => {
    const properties: Record<string, JSONSchema> = {};

    for (const [key, config] of Object.entries(schema)) properties[key] = buildType(key, config);

    return Typebox.Object(properties, { additionalProperties: !(options.validate_options?.strip_unknown ?? false) });
  };

  const buildSchemaUnion = (schema: SchemaUnion) => {
    const schemas = schema.map((schema) => buildSchemaSingle(schema));

    return Typebox.Union(schemas);
  };

  const buildSchema = (schema: Schema) => {
    if (Array.isArray(schema)) {
      return buildSchemaUnion(schema);
    } else return buildSchemaSingle(schema);
  };

  return buildSchema(schema);
};
