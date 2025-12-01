# @kb-labs/api-contracts

Shared API contracts for KB Labs REST/CLI/Studio surfaces.

## Vision & Purpose

**@kb-labs/api-contracts** provides shared API contracts for KB Labs REST/CLI/Studio surfaces. It includes error codes, envelopes, system types, and ready state definitions.

### Core Goals

- **Error Codes**: Standardized error codes for API responses
- **Envelopes**: Response envelope types
- **System Types**: System-level type definitions
- **Ready State**: Ready state definitions

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
API Contracts
    │
    ├──► Error Codes
    ├──► Envelopes
    ├──► System Types
    └──► Ready State
```

### Key Components

1. **Error Codes** (`error-code.ts`): Standardized error codes
2. **Envelopes** (`envelopes.ts`): Response envelope types
3. **System Types** (`system.ts`): System-level type definitions
4. **Ready State** (`ready.ts`): Ready state definitions

## ✨ Features

- **Error Codes**: Standardized error codes for API responses
- **Envelopes**: Response envelope types for consistent API responses
- **System Types**: System-level type definitions
- **Ready State**: Ready state definitions

## 📦 API Reference

### Main Exports

#### Error Codes

- `ErrorCode`: Error code enum
- `getErrorCode`: Get error code from error

#### Envelopes

- `ErrorEnvelope`: Error envelope type
- `SuccessEnvelope`: Success envelope type

#### System Types

- `SystemInfo`: System information type
- `SystemHealth`: System health type

#### Ready State

- `ReadyState`: Ready state type
- `isReady`: Check if system is ready

## 🔧 Configuration

### Configuration Options

No configuration needed - pure type definitions.

## 🔗 Dependencies

### Runtime Dependencies

- `zod` (`^4.1.5`): Schema validation

### Development Dependencies

- `@kb-labs/devkit` (`workspace:*`): DevKit presets
- `@types/node` (`^24.3.3`): Node.js types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

No tests currently.

### Test Coverage

- **Current Coverage**: ~50%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for all operations
- **Space Complexity**: O(1)
- **Bottlenecks**: None

## 🔒 Security

### Security Considerations

- **Type Safety**: TypeScript type safety

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Error Codes**: Fixed error codes

### Future Improvements

- **More Error Codes**: Additional error codes

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Use Error Codes

```typescript
import { ErrorCode } from '@kb-labs/api-contracts';

const error = {
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Something went wrong',
};
```

### Example 2: Use Envelopes

```typescript
import { ErrorEnvelope, SuccessEnvelope } from '@kb-labs/api-contracts';

const errorEnvelope: ErrorEnvelope = {
  ok: false,
  error: { code: 'ERROR', message: 'Error message' },
};

const successEnvelope: SuccessEnvelope = {
  ok: true,
  data: { result: 'success' },
};
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs

