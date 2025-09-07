const Ajv = require('ajv');
const addFormats = require('ajv-formats');

function createAjv(options = {}) {
  const ajv = new Ajv({
    strict: false,
    allowUnionTypes: true,
    allErrors: true,
    ...options,
  });
  addFormats(ajv);
  return ajv;
}

module.exports = { createAjv };

