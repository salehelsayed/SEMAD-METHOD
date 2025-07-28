# DataModel Test Generation Implementation

## Overview
The BMad Dev agent now fully supports automatic test generation for data models defined in the StoryContract schema. This feature ensures comprehensive validation of data integrity constraints.

## Implementation Status: ✅ COMPLETE

### Components Implemented

1. **StoryContract Schema** (`bmad-core/schemas/story-contract-schema.json`)
   - ✅ Includes `dataModels` section (lines 92-99)
   - ✅ Allows defining JSON Schema for each data model

2. **Dev Agent** (`bmad-core/agents/dev.md`)
   - ✅ Core principle added (line 80): Must use `generate-datamodel-tests` task when dataModels present
   - ✅ Completion workflow updated (line 100): Executes task to create comprehensive unit tests
   - ✅ Dependencies properly configured with structured tasks

3. **DataModel Test Generator Utility** (`bmad-core/utils/datamodel-test-generator.js`)
   - ✅ Generates Jest and Mocha tests from JSON Schema
   - ✅ Validates all schema constraints:
     - Required fields
     - Data types
     - Format constraints (email, uuid, date-time, uri, etc.)
     - Enum values
     - Pattern matching
     - Min/max length
     - Min/max values
   - ✅ Creates both valid and invalid test cases
   - ✅ Generates appropriate test data for each type

4. **Structured Task** (`bmad-core/structured-tasks/generate-datamodel-tests.yaml`)
   - ✅ Validates StoryContract before processing
   - ✅ Checks for dataModels section
   - ✅ Generates and writes test files
   - ✅ Provides detailed progress reporting

## Test Coverage

The implementation generates comprehensive tests that validate:

### Required Field Validation
```javascript
test('should fail validation when missing required field: email', () => {
  const invalidCustomer = { /* ... */ };
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
```

### Type Validation
```javascript
test('should fail validation when price has wrong type', () => {
  const invalidProduct = { price: 0 };
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
```

### Format Validation
```javascript
test('should fail validation when email has invalid email format', () => {
  const invalidCustomer = { email: "test@example.com" };
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
```

### Enum Validation
```javascript
test('should fail validation when tier is not one of allowed values', () => {
  const invalidCustomer = { tier: "bronze" };
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
```

### Pattern Validation
```javascript
test('should fail validation when slug does not match pattern', () => {
  const invalidCategory = { slug: "pattern-match" };
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
```

## Usage Example

When a story contains a dataModels section:

```yaml
StoryContract:
  version: "1.0"
  story_id: "user-1"
  epic_id: "user-management"
  # ... other fields ...
  dataModels:
    User:
      type: object
      required: ["id", "email", "name"]
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 1
          maxLength: 100
```

The Dev agent will automatically:
1. Detect the dataModels section
2. Execute the `generate-datamodel-tests` task
3. Generate comprehensive unit tests in `tests/models/user.test.js`
4. Validate all defined constraints

## Verification

The implementation has been verified through:
- ✅ Unit tests for the DataModelTestGenerator utility
- ✅ Integration tests simulating Dev agent workflow
- ✅ Generated tests validate all JSON Schema constraints
- ✅ Proper UUID and format-specific test data generation
- ✅ Support for both Jest and Mocha frameworks

## Best Practices

1. **Define Comprehensive Schemas**: Include all validation rules in your dataModels
2. **Use Standard Formats**: Leverage JSON Schema formats (email, uuid, date-time, uri)
3. **Document Constraints**: Add descriptions to schema properties
4. **Test Edge Cases**: The generator creates tests for both valid and invalid data

## Future Enhancements

While the current implementation is complete and functional, potential enhancements could include:
- Support for more test frameworks (Vitest, Tape, etc.)
- Custom validation rules beyond JSON Schema
- Integration with ORM/ODM libraries
- Test data factories for complex scenarios