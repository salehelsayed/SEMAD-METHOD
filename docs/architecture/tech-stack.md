# Technology Stack

## Core Technologies
- **Runtime**: Node.js v20+
- **Language**: JavaScript (ES6+)
- **Package Manager**: NPM

## Key Dependencies
- **YAML Processing**: js-yaml
- **CLI Interface**: commander
- **File System**: Node.js fs/promises
- **Path Handling**: Node.js path
- **Template Processing**: Custom YAML-based templates

## Development Tools
- **Testing**: Jest (planned)
- **Linting**: ESLint (planned)
- **Formatting**: Prettier
- **Version Control**: Git with Husky hooks

## Architecture Patterns
- **Modular Design**: Separate concerns into focused modules
- **Dependency Injection**: Use dependency resolver for file loading
- **Template-Driven**: YAML-based templates for agents and tasks
- **CLI-First**: Command-line interface as primary interaction method

## File Formats
- **Agents**: Markdown with embedded YAML
- **Tasks**: YAML with structured format
- **Templates**: YAML with template variables
- **Configuration**: YAML configuration files
- **Documentation**: Markdown

## Build and Distribution
- **Build System**: Custom web-builder for browser bundles
- **Distribution**: NPM packages and direct file distribution
- **Installation**: NPX-based installer for project setup

## Memory Management
- **Vector Database**: Qdrant for agent memory storage
- **Memory Hygiene**: Automated cleanup and summarization
- **Context Management**: Structured memory with tagging system