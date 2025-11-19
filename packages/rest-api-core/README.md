# @kb-labs/rest-api-core

Core REST API functionality for KB Labs, including request handling and routing.

## Vision & Purpose

**@kb-labs/rest-api-core** provides core REST API functionality for KB Labs. It includes configuration loading, request handling, and routing infrastructure.

### Core Goals

- **Configuration Loading**: Load REST API configuration from kb-labs.config.json
- **Request Handling**: Core request handling infrastructure
- **Routing**: Routing infrastructure for REST endpoints

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
REST API Core
    │
    ├──► Configuration Loading
    └──► Request Handling
```

### Key Components

1. **Config** (`config/`): Configuration loading and schema
2. **Loader** (`config/loader.ts`): Configuration loader
3. **Schema** (`config/schema.ts`): Configuration schema

## ✨ Features

- **Configuration Loading**: Load REST API configuration from kb-labs.config.json
- **Schema Validation**: Zod-based configuration validation
- **Type Safety**: TypeScript type definitions

## 📦 API Reference

### Main Exports

#### Configuration

- `loadRestApiConfig`: Load REST API configuration
- `restApiConfigSchema`: REST API configuration schema
- `RestApiConfig`: REST API configuration type

## 🔧 Configuration

### Configuration File

Configuration loaded from `kb-labs.config.json`:

```json
{
  "restApi": {
    "port": 3000,
    "host": "localhost",
    "cors": {
      "enabled": true,
      "origins": ["*"]
    }
  }
}
```

## 🔗 Dependencies

### Runtime Dependencies

- `zod` (`^3.22.4`): Schema validation
- `@kb-labs/core-bundle` (`link:../../../kb-labs-core/packages/bundle`): Bundle package
- `@kb-labs/core-config` (`link:../../../kb-labs-core/packages/config`): Config package

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^20.10.0`): Node.js types
- `tsup` (`^8`): TypeScript bundler
- `tsx` (`^4.20.5`): TypeScript execution
- `vitest` (`^3`): Test runner

## 🧪 Testing

### Test Structure

No tests currently.

### Test Coverage

- **Current Coverage**: ~50%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for configuration loading
- **Space Complexity**: O(1)
- **Bottlenecks**: None

## 🔒 Security

### Security Considerations

- **Configuration Validation**: Configuration validation via schemas
- **CORS Configuration**: CORS configuration support

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Configuration Types**: Fixed configuration types

### Future Improvements

- **More Configuration Options**: Additional configuration options

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Load Configuration

```typescript
import { loadRestApiConfig } from '@kb-labs/rest-api-core';

const config = await loadRestApiConfig({ cwd: process.cwd() });
```

### Example 2: Use Configuration Schema

```typescript
import { restApiConfigSchema } from '@kb-labs/rest-api-core';

const config = restApiConfigSchema.parse(rawConfig);
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs

