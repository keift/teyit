export type String = {
  type: 'string';
  enum?: string[];
  pattern?: string;
  min?: number;
  max?: number;
  default?: string | null;
  trim?: boolean; // Default: true
  lowercase?: boolean;
  uppercase?: boolean;
  nullable: boolean;
  required: boolean;
};

export type Number = {
  type: 'number';
  enum?: number[];
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
  negative?: boolean;
  default?: number | null;
  nullable: boolean;
  required: boolean;
};

export type Boolean = {
  type: 'boolean';
  default?: boolean | null;
  nullable: boolean;
  required: boolean;
};

export type Date = {
  type: 'date';
  min?: string;
  max?: string;
  default?: string | null;
  nullable: boolean;
  required: boolean;
};

export type Object = {
  type: 'object';
  properties: Schema;
  default?: Record<string, unknown> | null;
  nullable: boolean;
  required: boolean;
};

export type _Array = {
  type: 'array';
  min?: number;
  max?: number;
  items: Type;
  default?: unknown[] | null;
  nullable: boolean;
  required: boolean;
};

export type TypeSingle = String | Number | Boolean | Date | Object | _Array;

export type TypeUnion = [TypeSingle, TypeSingle, ...TypeSingle[]];

export type Type = TypeSingle | TypeUnion;

export type SchemaSingle = Record<string, Type>;

export type SchemaUnion = [SchemaSingle, SchemaSingle, ...SchemaSingle[]];

export type Schema = SchemaSingle | SchemaUnion;
