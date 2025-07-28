const Ajv = require('ajv');
const addFormats = require('ajv-formats');

describe('Customer Data Model Validation', () => {
  let ajv;
  let validate;
  const schema = {
  "type": "object",
  "required": [
    "id",
    "email",
    "name",
    "tier"
  ],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique customer identifier"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "Customer email address"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Customer full name"
    },
    "tier": {
      "type": "string",
      "enum": [
        "bronze",
        "silver",
        "gold",
        "platinum"
      ],
      "default": "bronze",
      "description": "Customer tier level"
    },
    "phone": {
      "type": "string",
      "pattern": "^\\+?[1-9]\\d{1,14}$",
      "description": "E.164 format phone number"
    },
    "registeredAt": {
      "type": "string",
      "format": "date-time",
      "description": "Registration timestamp"
    },
    "metadata": {
      "type": "object",
      "additionalProperties": true,
      "description": "Additional customer metadata"
    }
  }
};
  
  beforeAll(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe('Valid Customer objects', () => {
    test('should validate a complete valid Customer', () => {
      const validCustomer = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "name": "example string",
  "tier": "bronze",
  "phone": "+1234567890",
  "registeredAt": "2024-01-01T00:00:00Z",
  "metadata": {}
};
      
      const isValid = validate(validCustomer);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    test('should validate Customer with only required fields', () => {
      const minimalCustomer = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "name": "example string",
  "tier": "bronze"
};
      
      const isValid = validate(minimalCustomer);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });

  });

  describe('Invalid Customer objects', () => {
    test('should fail validation when missing required field: id', () => {
      const invalidCustomer = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "name": "example string",
  "tier": "bronze",
  "phone": "pattern-match",
  "registeredAt": "2024-01-01T00:00:00Z",
  "metadata": {}
};
      delete invalidCustomer.id;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'id' }
        })
      );
    });

    test('should fail validation when missing required field: email', () => {
      const invalidCustomer = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "name": "example string",
  "tier": "bronze",
  "phone": "pattern-match",
  "registeredAt": "2024-01-01T00:00:00Z",
  "metadata": {}
};
      delete invalidCustomer.email;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'email' }
        })
      );
    });

    test('should fail validation when missing required field: name', () => {
      const invalidCustomer = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "name": "example string",
  "tier": "bronze",
  "phone": "pattern-match",
  "registeredAt": "2024-01-01T00:00:00Z",
  "metadata": {}
};
      delete invalidCustomer.name;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'name' }
        })
      );
    });

    test('should fail validation when missing required field: tier', () => {
      const invalidCustomer = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "test@example.com",
  "name": "example string",
  "tier": "bronze",
  "phone": "pattern-match",
  "registeredAt": "2024-01-01T00:00:00Z",
  "metadata": {}
};
      delete invalidCustomer.tier;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'tier' }
        })
      );
    });

    test('should fail validation when id has wrong type', () => {
      const invalidCustomer = {
  "id": "550e8400-e29b-41d4-a716-446655440000"
};
      invalidCustomer.id = 123;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/id'
        })
      );
    });

    test('should fail validation when id has invalid uuid format', () => {
      const invalidCustomer = {
  "id": "550e8400-e29b-41d4-a716-446655440000"
};
      invalidCustomer.id = 'not-a-uuid';
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/id'
        })
      );
    });

    test('should fail validation when email has wrong type', () => {
      const invalidCustomer = {
  "email": "test@example.com"
};
      invalidCustomer.email = 123;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/email'
        })
      );
    });

    test('should fail validation when email has invalid email format', () => {
      const invalidCustomer = {
  "email": "test@example.com"
};
      invalidCustomer.email = 'not-an-email';
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/email'
        })
      );
    });

    test('should fail validation when name has wrong type', () => {
      const invalidCustomer = {
  "name": "example string"
};
      invalidCustomer.name = 123;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/name'
        })
      );
    });

    test('should fail validation when tier has wrong type', () => {
      const invalidCustomer = {
  "tier": "bronze"
};
      invalidCustomer.tier = 123;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/tier'
        })
      );
    });

    test('should fail validation when tier is not one of allowed values', () => {
      const invalidCustomer = {
  "tier": "bronze"
};
      invalidCustomer.tier = 'invalid_enum_value';
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/tier'
        })
      );
    });

    test('should fail validation when phone has wrong type', () => {
      const invalidCustomer = {
  "phone": "pattern-match"
};
      invalidCustomer.phone = 123;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/phone'
        })
      );
    });

    test('should fail validation when phone does not match pattern', () => {
      const invalidCustomer = {
  "phone": "pattern-match"
};
      invalidCustomer.phone = 'invalid_pattern_value';
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/phone'
        })
      );
    });

    test('should fail validation when registeredAt has wrong type', () => {
      const invalidCustomer = {
  "registeredAt": "2024-01-01T00:00:00Z"
};
      invalidCustomer.registeredAt = 123;
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/registeredAt'
        })
      );
    });

    test('should fail validation when registeredAt has invalid date-time format', () => {
      const invalidCustomer = {
  "registeredAt": "2024-01-01T00:00:00Z"
};
      invalidCustomer.registeredAt = 'not-a-datetime';
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/registeredAt'
        })
      );
    });

    test('should fail validation when metadata has wrong type', () => {
      const invalidCustomer = {
  "metadata": {}
};
      invalidCustomer.metadata = "not an object";
      
      const isValid = validate(invalidCustomer);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/metadata'
        })
      );
    });

  });
});
