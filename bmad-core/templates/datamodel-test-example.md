# DataModel Test Generation Example

This document demonstrates how the `generate-datamodel-tests` task creates unit tests from a StoryContract's dataModels section.

## Example StoryContract with DataModels

```yaml
StoryContract:
  version: "1.0"
  story_id: "5.1"
  epic_id: "5"
  apiEndpoints:
    - method: POST
      path: /api/users
      description: Create a new user
      requestBody:
        type: object
        properties:
          email: { type: string, format: email }
          password: { type: string, minLength: 8 }
          role: { type: string, enum: ["admin", "user", "guest"] }
        required: ["email", "password", "role"]
  filesToModify:
    - path: src/models/user.js
      reason: Define User model with validation
    - path: src/models/role.js
      reason: Define Role model with permissions
  acceptanceCriteriaLinks: ["AC-5.1.1", "AC-5.1.2"]
  dataModels:
    User:
      type: object
      required: ["id", "email", "hashedPassword", "role", "createdAt"]
      properties:
        id:
          type: string
          format: uuid
          description: Unique identifier for the user
        email:
          type: string
          format: email
          description: User's email address
        hashedPassword:
          type: string
          minLength: 60
          description: Bcrypt hashed password
        role:
          type: string
          enum: ["admin", "user", "guest"]
          description: User's role in the system
        profile:
          type: object
          properties:
            firstName:
              type: string
              maxLength: 50
            lastName:
              type: string
              maxLength: 50
            avatar:
              type: string
              format: uri
          required: ["firstName", "lastName"]
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    Role:
      type: object
      required: ["name", "permissions"]
      properties:
        name:
          type: string
          enum: ["admin", "user", "guest"]
        permissions:
          type: array
          items:
            type: string
            enum: ["read", "write", "delete", "admin"]
          minItems: 1
        description:
          type: string
          maxLength: 200
```

## Generated Test Output

When the Dev agent executes `generate-datamodel-tests` task with the above StoryContract, it will generate the following test files:

### tests/models/user.test.js

```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

describe('User Data Model Validation', () => {
  let ajv;
  let validate;
  
  const schema = {
    "type": "object",
    "required": ["id", "email", "hashedPassword", "role", "createdAt"],
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "description": "Unique identifier for the user"
      },
      "email": {
        "type": "string",
        "format": "email",
        "description": "User's email address"
      },
      "hashedPassword": {
        "type": "string",
        "minLength": 60,
        "description": "Bcrypt hashed password"
      },
      "role": {
        "type": "string",
        "enum": ["admin", "user", "guest"],
        "description": "User's role in the system"
      },
      "profile": {
        "type": "object",
        "properties": {
          "firstName": {
            "type": "string",
            "maxLength": 50
          },
          "lastName": {
            "type": "string",
            "maxLength": 50
          },
          "avatar": {
            "type": "string",
            "format": "uri"
          }
        },
        "required": ["firstName", "lastName"]
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "updatedAt": {
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

  describe('Valid User objects', () => {
    test('should validate a complete valid User', () => {
      const validUser = {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "test@example.com",
        "hashedPassword": "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
        "role": "admin",
        "profile": {
          "firstName": "John",
          "lastName": "Doe",
          "avatar": "https://example.com/avatar.jpg"
        },
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      };
      
      const isValid = validate(validUser);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    test('should validate User with only required fields', () => {
      const minimalUser = {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "test@example.com",
        "hashedPassword": "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
        "role": "user",
        "createdAt": "2024-01-01T00:00:00Z"
      };
      
      const isValid = validate(minimalUser);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });
  });

  describe('Invalid User objects', () => {
    test('should fail validation when missing required field: id', () => {
      const invalidUser = {
        "email": "test@example.com",
        "hashedPassword": "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
        "role": "admin",
        "createdAt": "2024-01-01T00:00:00Z"
      };
      
      const isValid = validate(invalidUser);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'id' }
        })
      );
    });

    test('should fail validation when email has wrong type', () => {
      const invalidUser = {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": 123,
        "hashedPassword": "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
        "role": "admin",
        "createdAt": "2024-01-01T00:00:00Z"
      };
      
      const isValid = validate(invalidUser);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/email'
        })
      );
    });

    test('should fail validation when email has invalid email format', () => {
      const invalidUser = {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "not-an-email",
        "hashedPassword": "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
        "role": "admin",
        "createdAt": "2024-01-01T00:00:00Z"
      };
      
      const isValid = validate(invalidUser);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/email'
        })
      );
    });

    test('should fail validation when role is not one of allowed values', () => {
      const invalidUser = {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "test@example.com",
        "hashedPassword": "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
        "role": "superadmin",
        "createdAt": "2024-01-01T00:00:00Z"
      };
      
      const isValid = validate(invalidUser);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/role'
        })
      );
    });

    test('should fail validation when hashedPassword is too short', () => {
      const invalidUser = {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "test@example.com",
        "hashedPassword": "tooshort",
        "role": "admin",
        "createdAt": "2024-01-01T00:00:00Z"
      };
      
      const isValid = validate(invalidUser);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minLength',
          instancePath: '/hashedPassword'
        })
      );
    });
  });
});
```

### tests/models/role.test.js

```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

describe('Role Data Model Validation', () => {
  let ajv;
  let validate;
  
  const schema = {
    "type": "object",
    "required": ["name", "permissions"],
    "properties": {
      "name": {
        "type": "string",
        "enum": ["admin", "user", "guest"]
      },
      "permissions": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["read", "write", "delete", "admin"]
        },
        "minItems": 1
      },
      "description": {
        "type": "string",
        "maxLength": 200
      }
    }
  };
  
  beforeAll(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe('Valid Role objects', () => {
    test('should validate a complete valid Role', () => {
      const validRole = {
        "name": "admin",
        "permissions": ["read", "write", "delete", "admin"],
        "description": "Full system administrator with all permissions"
      };
      
      const isValid = validate(validRole);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    test('should validate Role with only required fields', () => {
      const minimalRole = {
        "name": "guest",
        "permissions": ["read"]
      };
      
      const isValid = validate(minimalRole);
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();
    });
  });

  describe('Invalid Role objects', () => {
    test('should fail validation when missing required field: name', () => {
      const invalidRole = {
        "permissions": ["read", "write"]
      };
      
      const isValid = validate(invalidRole);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'name' }
        })
      );
    });

    test('should fail validation when permissions array is empty', () => {
      const invalidRole = {
        "name": "admin",
        "permissions": []
      };
      
      const isValid = validate(invalidRole);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/permissions'
        })
      );
    });

    test('should fail validation when permission contains invalid value', () => {
      const invalidRole = {
        "name": "admin",
        "permissions": ["read", "execute"]
      };
      
      const isValid = validate(invalidRole);
      expect(isValid).toBe(false);
      expect(validate.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/permissions/1'
        })
      );
    });
  });
});
```

## Usage in Dev Agent Workflow

When the Dev agent processes a story with dataModels:

1. It checks if the StoryContract contains a `dataModels` section
2. If found, it executes: `*execute-task generate-datamodel-tests`
3. The task generates comprehensive unit tests for each model
4. Tests are written to the specified output directory (default: `tests/models/`)
5. The Dev agent then includes these test files in the story's File List
6. Tests validate:
   - Required fields presence
   - Data type correctness
   - Format constraints (email, uuid, date-time, uri)
   - Enum value restrictions
   - String length constraints (minLength, maxLength)
   - Array constraints (minItems, maxItems)
   - Nested object validation

This ensures that all data models defined in the StoryContract have comprehensive validation coverage without the Dev agent needing to manually write these tests.