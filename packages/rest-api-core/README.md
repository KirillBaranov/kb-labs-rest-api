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
    "basePath": "/api/v1",
    "apiVersion": "1.0.0",
    "cors": {
      "origins": ["http://localhost:3000", "http://localhost:5173"],
      "allowCredentials": true,
      "profile": "dev"
    },
    "timeouts": {
      "requestTimeout": 30000,
      "bodyLimit": 10485760
    },
    "http2": {
      "enabled": false,
      "allowHTTP1": true
    },
    "ssl": {
      "keyPath": "/path/to/server.key",
      "certPath": "/path/to/server.cert"
    }
  }
}
```

### HTTP/2 Configuration

HTTP/2 can be enabled to remove connection pool limits (HTTP/1.1 has 6 concurrent connections per domain):

**Benefits:**
- Removes 6 connection limit (important for SSE connections)
- Request multiplexing over single TCP connection
- Header compression and server push support
- Backward compatible with HTTP/1.1 (via `allowHTTP1` flag)

**Requirements:**
- HTTPS with valid SSL certificates
- Modern browser (95%+ support)

**Generate self-signed certificates for development:**

```bash
# Create ssl directory
mkdir -p ssl

# Generate self-signed certificate (valid for localhost)
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout ssl/server.key \
  -out ssl/server.cert \
  -days 365 \
  -subj "/CN=localhost"
```

**For production (Let's Encrypt):**

```bash
# Install certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificates will be in:
# /etc/letsencrypt/live/your-domain.com/privkey.pem (key)
# /etc/letsencrypt/live/your-domain.com/fullchain.pem (cert)
```

**Configuration:**

```json
{
  "restApi": {
    "http2": {
      "enabled": true,
      "allowHTTP1": true
    },
    "ssl": {
      "keyPath": "ssl/server.key",
      "certPath": "ssl/server.cert"
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

