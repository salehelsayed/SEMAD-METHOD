const Ajv = require('ajv');
const addFormats = require('ajv-formats');

describe('Product Data Model Validation', () => {
  let ajv;
  let validate;
  const schema = {
  "type": "object",
  "required": [
    "id",
    "name",
    "price",
    "category",
    "status"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string",
      "minLength": 3,
      "maxLength": 100
    },
    "price": {
      "type": "number",
      "minimum": 0,
      "exclusiveMaximum": 1000000
    },
    "category": {
      "type": "string",
      "enum": [
        "electronics",
        "clothing",
        "food",
        "books",
        "other"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "active",
        "inactive",
        "discontinued"
      ],
      "default": "active"
    },
    "description": {
      "type": "string",
      "maxLength": 500
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 2
      },
      "maxItems": 10
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    }
  }
};
  
  beforeAll(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe('Valid Product objects', () => {
    test('should validate a complete valid Product', () => {
      const validProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "example string",
  "price": 0,
  "category": "electronics",
  "status": "active",
  "description": "example string",
  "tags": [
    "example string"
  ],
  "createdAt": "2024-01-01T00:00:00Z"
};
      
      const isValid = validate(validProduct);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    test('should validate Product with only required fields', () => {
      const minimalProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "example string",
  "price": 0,
  "category": "electronics",
  "status": "active"
};
      
      const isValid = validate(minimalProduct);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });

  });

  describe('Invalid Product objects', () => {
    test('should fail validation when missing required field: id', () => {
      const invalidProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "example string",
  "price": 0,
  "category": "electronics",
  "status": "active",
  "description": "example string",
  "tags": [
    "example string"
  ],
  "createdAt": "2024-01-01T00:00:00Z"
};
      delete invalidProduct.id;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'id' }
        })
      );
    });

    test('should fail validation when missing required field: name', () => {
      const invalidProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "example string",
  "price": 0,
  "category": "electronics",
  "status": "active",
  "description": "example string",
  "tags": [
    "example string"
  ],
  "createdAt": "2024-01-01T00:00:00Z"
};
      delete invalidProduct.name;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'name' }
        })
      );
    });

    test('should fail validation when missing required field: price', () => {
      const invalidProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "example string",
  "price": 0,
  "category": "electronics",
  "status": "active",
  "description": "example string",
  "tags": [
    "example string"
  ],
  "createdAt": "2024-01-01T00:00:00Z"
};
      delete invalidProduct.price;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'price' }
        })
      );
    });

    test('should fail validation when missing required field: category', () => {
      const invalidProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "example string",
  "price": 0,
  "category": "electronics",
  "status": "active",
  "description": "example string",
  "tags": [
    "example string"
  ],
  "createdAt": "2024-01-01T00:00:00Z"
};
      delete invalidProduct.category;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'category' }
        })
      );
    });

    test('should fail validation when missing required field: status', () => {
      const invalidProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "example string",
  "price": 0,
  "category": "electronics",
  "status": "active",
  "description": "example string",
  "tags": [
    "example string"
  ],
  "createdAt": "2024-01-01T00:00:00Z"
};
      delete invalidProduct.status;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'status' }
        })
      );
    });

    test('should fail validation when id has wrong type', () => {
      const invalidProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000"
};
      invalidProduct.id = 123;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/id'
        })
      );
    });

    test('should fail validation when id has invalid uuid format', () => {
      const invalidProduct = {
  "id": "550e8400-e29b-41d4-a716-446655440000"
};
      invalidProduct.id = 'not-a-uuid';
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/id'
        })
      );
    });

    test('should fail validation when name has wrong type', () => {
      const invalidProduct = {
  "name": "example string"
};
      invalidProduct.name = 123;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/name'
        })
      );
    });

    test('should fail validation when price has wrong type', () => {
      const invalidProduct = {
  "price": 0
};
      invalidProduct.price = "not a number";
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/price'
        })
      );
    });

    test('should fail validation when category has wrong type', () => {
      const invalidProduct = {
  "category": "electronics"
};
      invalidProduct.category = 123;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/category'
        })
      );
    });

    test('should fail validation when category is not one of allowed values', () => {
      const invalidProduct = {
  "category": "electronics"
};
      invalidProduct.category = 'invalid_enum_value';
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/category'
        })
      );
    });

    test('should fail validation when status has wrong type', () => {
      const invalidProduct = {
  "status": "active"
};
      invalidProduct.status = 123;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/status'
        })
      );
    });

    test('should fail validation when status is not one of allowed values', () => {
      const invalidProduct = {
  "status": "active"
};
      invalidProduct.status = 'invalid_enum_value';
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/status'
        })
      );
    });

    test('should fail validation when description has wrong type', () => {
      const invalidProduct = {
  "description": "example string"
};
      invalidProduct.description = 123;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/description'
        })
      );
    });

    test('should fail validation when tags has wrong type', () => {
      const invalidProduct = {
  "tags": [
    "example string"
  ]
};
      invalidProduct.tags = "not an array";
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/tags'
        })
      );
    });

    test('should fail validation when createdAt has wrong type', () => {
      const invalidProduct = {
  "createdAt": "2024-01-01T00:00:00Z"
};
      invalidProduct.createdAt = 123;
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/createdAt'
        })
      );
    });

    test('should fail validation when createdAt has invalid date-time format', () => {
      const invalidProduct = {
  "createdAt": "2024-01-01T00:00:00Z"
};
      invalidProduct.createdAt = 'not-a-datetime';
      
      const isValid = validate(invalidProduct);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/createdAt'
        })
      );
    });

  });
});
