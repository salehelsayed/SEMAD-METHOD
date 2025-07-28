---
StoryContract:
  version: "1.0"
  story_id: "test-1"
  epic_id: "test"
  apiEndpoints:
    - method: POST
      path: /api/products
      description: Create a new product
      requestBody:
        type: object
        properties:
          name: { type: string }
          price: { type: number }
          category: { type: string }
        required: ["name", "price", "category"]
  filesToModify:
    - path: src/models/product.js
      reason: Define Product model
    - path: src/models/category.js
      reason: Define Category model
  acceptanceCriteriaLinks: ["AC-TEST-1", "AC-TEST-2"]
  dataModels:
    Product:
      type: object
      required: ["id", "name", "price", "category", "status"]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
          minLength: 3
          maxLength: 100
        price:
          type: number
          minimum: 0
          exclusiveMaximum: 1000000
        category:
          type: string
          enum: ["electronics", "clothing", "food", "books", "other"]
        status:
          type: string
          enum: ["active", "inactive", "discontinued"]
          default: "active"
        description:
          type: string
          maxLength: 500
        tags:
          type: array
          items:
            type: string
            minLength: 2
          maxItems: 10
        createdAt:
          type: string
          format: date-time
    Category:
      type: object
      required: ["id", "name", "slug"]
      properties:
        id:
          type: string
          pattern: "^CAT-[0-9]{4}$"
        name:
          type: string
          minLength: 2
          maxLength: 50
        slug:
          type: string
          pattern: "^[a-z0-9-]+$"
        parentId:
          type: string
          pattern: "^CAT-[0-9]{4}$"
        active:
          type: boolean
          default: true
---

# Test Story: Product Management with DataModels

## Status
Draft

## Story
**As a** Developer,
**I want** to test the dataModel test generation,
**so that** I can verify the implementation works correctly

## Tasks
- [ ] Create Product model
- [ ] Create Category model
- [ ] Generate tests for dataModels