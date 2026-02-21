import { Teyit, type Schema } from '../src/main';

const teyit = new Teyit({ output_dir: './tests/generated/teyit' });

export const schema: Schema = [
  {
    username: {
      type: 'string',
      min: 4,
      max: 20,
      trim: true,
      lowercase: true,
      pattern: '^[a-z0-9_]+$',
      nullable: true,
      required: true
    }
  },
  {
    username: {
      type: 'string',
      min: 4,
      max: 20,
      trim: true,
      lowercase: true,
      pattern: '^[a-z0-9_]+$',
      nullable: false,
      required: true
    },

    country_code: {
      type: 'string',
      enum: ['TR', 'US', 'GB'],
      uppercase: true,
      nullable: true,
      required: true
    },

    age: {
      type: 'number',
      min: 18,
      max: 120,
      integer: true,
      positive: true,
      nullable: false,
      required: true
    },

    balance_offset: {
      type: 'number',
      negative: true,
      nullable: true,
      required: false,
      default: -10
    },

    is_active: {
      type: 'boolean',
      nullable: false,
      required: false,
      default: true
    },

    registration_date: {
      type: 'date',
      min: '2020-01-01T00:00:00.000Z',
      max: '2030-12-31T23:59:59.999Z',
      nullable: false,
      required: true
    },

    address: {
      type: 'object',
      nullable: false,
      required: true,
      properties: {
        city: {
          type: 'string',
          trim: true,
          nullable: false,
          required: true
        },
        zip_code: {
          type: 'number',
          integer: true,
          positive: true,
          nullable: false,
          required: true
        }
      }
    },

    tags: {
      type: 'array',
      min: 1,
      max: 5,
      nullable: false,
      required: true,
      items: {
        type: 'string',
        min: 2,
        lowercase: true,
        nullable: false,
        required: true
      }
    },

    legacy_id: [
      {
        type: 'string',
        pattern: '^ID-\\d+$',
        nullable: false,
        required: true
      },
      {
        type: 'number',
        positive: true,
        integer: true,
        nullable: false,
        required: true
      }
    ]
  }
];

export const correct_properties = {
  username: 'fir4tozden',

  country_code: 'TR',

  age: 28,

  balance_offset: null,

  registration_date: '2024-05-15',

  address: {
    city: ' Muğla ',
    zip_code: 48000
  },

  tags: ['TypeScript', 'NodeJS'],

  legacy_id: 'ID-98765'
};

console.log(await teyit.validate(schema, correct_properties));
