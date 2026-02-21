import { Teyit, type Schema } from '../src/main';

const teyit = new Teyit({ output_dir: './tests/generated/teyit' });

const schema: Schema = {
  field: {
    type: 'string',
    nullable: false,
    required: true
  }
};

console.log(await teyit.validate(schema, { field: 'username' }));
