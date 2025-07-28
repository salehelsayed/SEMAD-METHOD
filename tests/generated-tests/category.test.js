const Ajv = require('ajv');
const addFormats = require('ajv-formats');

describe('Category Data Model Validation', () => {
  let ajv;
  let validate;
  const schema = {
  "type": "object",
  "required": [
    "id",
    "name",
    "slug"
  ],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^CAT-[0-9]{4}$"
    },
    "name": {
      "type": "string",
      "minLength": 2,
      "maxLength": 50
    },
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9-]+$"
    },
    "parentId": {
      "type": "string",
      "pattern": "^CAT-[0-9]{4}$"
    },
    "active": {
      "type": "boolean",
      "default": true
    }
  }
};
  
  beforeAll(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe('Valid Category objects', () => {
    test('should validate a complete valid Category', () => {
      const validCategory = {
  "id": "CAT-1234",
  "name": "example string",
  "slug": "example-slug-123",
  "parentId": "CAT-1234",
  "active": true
};
      
      const isValid = validate(validCategory);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    test('should validate Category with only required fields', () => {
      const minimalCategory = {
  "id": "CAT-1234",
  "name": "example string",
  "slug": "example-slug-123"
};
      
      const isValid = validate(minimalCategory);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });

  });

  describe('Invalid Category objects', () => {
    test('should fail validation when missing required field: id', () => {
      const invalidCategory = {
  "id": "CAT-1234",
  "name": "example string",
  "slug": "example-slug-123",
  "parentId": "CAT-1234",
  "active": true
};
      delete invalidCategory.id;
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'id' }
        })
      );
    });

    test('should fail validation when missing required field: name', () => {
      const invalidCategory = {
  "id": "CAT-1234",
  "name": "example string",
  "slug": "example-slug-123",
  "parentId": "CAT-1234",
  "active": true
};
      delete invalidCategory.name;
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'name' }
        })
      );
    });

    test('should fail validation when missing required field: slug', () => {
      const invalidCategory = {
  "id": "CAT-1234",
  "name": "example string",
  "slug": "example-slug-123",
  "parentId": "CAT-1234",
  "active": true
};
      delete invalidCategory.slug;
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'slug' }
        })
      );
    });

    test('should fail validation when id has wrong type', () => {
      const invalidCategory = {
  "id": "CAT-1234"
};
      invalidCategory.id = 123;
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/id'
        })
      );
    });

    test('should fail validation when id does not match pattern', () => {
      const invalidCategory = {
  "id": "CAT-1234"
};
      invalidCategory.id = 'invalid_pattern_value';
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/id'
        })
      );
    });

    test('should fail validation when name has wrong type', () => {
      const invalidCategory = {
  "name": "example string"
};
      invalidCategory.name = 123;
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/name'
        })
      );
    });

    test('should fail validation when slug has wrong type', () => {
      const invalidCategory = {
  "slug": "example-slug-123"
};
      invalidCategory.slug = 123;
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/slug'
        })
      );
    });

    test('should fail validation when slug does not match pattern', () => {
      const invalidCategory = {
  "slug": "example-slug-123"
};
      invalidCategory.slug = 'invalid_pattern_value';
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/slug'
        })
      );
    });

    test('should fail validation when parentId has wrong type', () => {
      const invalidCategory = {
  "parentId": "CAT-1234"
};
      invalidCategory.parentId = 123;
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/parentId'
        })
      );
    });

    test('should fail validation when parentId does not match pattern', () => {
      const invalidCategory = {
  "parentId": "CAT-1234"
};
      invalidCategory.parentId = 'invalid_pattern_value';
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/parentId'
        })
      );
    });

    test('should fail validation when active has wrong type', () => {
      const invalidCategory = {
  "active": true
};
      invalidCategory.active = "not a boolean";
      
      const isValid = validate(invalidCategory);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/active'
        })
      );
    });

  });
});
