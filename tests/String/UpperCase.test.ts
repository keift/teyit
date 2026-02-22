import { Teyit, type Schema } from '../../src/main';

const teyit = new Teyit();

const schema = {
  field: {
    type: 'string',
    uppercase: true,
    nullable: false,
    required: true
  }
} as const satisfies Schema;

const correct_properties = [
  {
    field: 'test'
  }
];

for (let i = 0; i < correct_properties.length; i++) {
  try {
    const fields = teyit.validate(schema, correct_properties[i]);

    if (fields.field !== 'TEST') throw new Error();

    console.log(`✅ Success ${String(i + 1)}/${String(correct_properties.length)} [CORRECT_PROPERTIES]`);
  } catch {
    throw new Error(`❌ Error ${String(i + 1)}/${String(correct_properties.length)} [CORRECT_PROPERTIES]`);
  }
}
