import { Teyit, type Schema } from '../../src/main';

const Yupp = new Teyit();

const schema: Schema = {
  field: {
    type: 'string',
    nullable: false,
    required: true
  }
};

const correct_properties = [
  {
    field: ' test '
  }
];

for (let i = 0; i < correct_properties.length; i++) {
  try {
    const fields = await Yupp.validate(schema, correct_properties[i]);

    if (fields.field !== 'test') throw new Error();

    console.log(`✅ Success ${String(i + 1)}/${String(correct_properties.length)} [CORRECT_PROPERTIES]`);
  } catch {
    throw new Error(`❌ Error ${String(i + 1)}/${String(correct_properties.length)} [CORRECT_PROPERTIES]`);
  }
}
