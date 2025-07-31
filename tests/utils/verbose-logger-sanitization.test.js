/**
 * Unit tests for VerboseLogger context sanitization
 */

const VerboseLogger = require('../../bmad-core/utils/verbose-logger');

describe('VerboseLogger - Context Sanitization', () => {
  let logger;

  beforeEach(() => {
    logger = new VerboseLogger({ verbosity: true, verbosityLevel: 'detailed' });
  });

  describe('sanitizeContext', () => {
    it('should redact password fields', () => {
      const context = {
        username: 'john',
        password: 'secret123',
        data: 'some data'
      };
      
      const sanitized = logger.sanitizeContext(context);
      expect(sanitized.username).toBe('john');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.data).toBe('some data');
    });

    it('should redact multiple sensitive fields', () => {
      const context = {
        api_key: 'abc123',
        secret: 'hidden',
        token: 'jwt-token',
        apiKey: 'key123',
        privateKey: 'private',
        authToken: 'auth123',
        normal: 'visible'
      };
      
      const sanitized = logger.sanitizeContext(context);
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.privateKey).toBe('[REDACTED]');
      expect(sanitized.authToken).toBe('[REDACTED]');
      expect(sanitized.normal).toBe('visible');
    });

    it('should handle nested objects', () => {
      const context = {
        config: {
          database: {
            host: 'localhost',
            password: 'db-secret',
            port: 5432
          },
          api: {
            endpoint: 'https://api.example.com',
            key: 'api-secret'
          }
        }
      };
      
      const sanitized = logger.sanitizeContext(context);
      expect(sanitized.config.database.host).toBe('localhost');
      expect(sanitized.config.database.password).toBe('[REDACTED]');
      expect(sanitized.config.database.port).toBe(5432);
      expect(sanitized.config.api.endpoint).toBe('https://api.example.com');
      expect(sanitized.config.api.key).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const context = {
        users: [
          { name: 'John', token: 'token1' },
          { name: 'Jane', token: 'token2' }
        ],
        data: ['value1', 'value2']
      };
      
      const sanitized = logger.sanitizeContext(context);
      expect(sanitized.users[0].name).toBe('John');
      expect(sanitized.users[0].token).toBe('[REDACTED]');
      expect(sanitized.users[1].name).toBe('Jane');
      expect(sanitized.users[1].token).toBe('[REDACTED]');
      expect(sanitized.data).toEqual(['value1', 'value2']);
    });

    it('should handle null and undefined values', () => {
      const context = {
        nullValue: null,
        undefinedValue: undefined,
        password: null,
        secret: undefined
      };
      
      const sanitized = logger.sanitizeContext(context);
      expect(sanitized.nullValue).toBeNull();
      expect(sanitized.undefinedValue).toBeUndefined();
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
    });

    it('should be case-insensitive for sensitive field detection', () => {
      const context = {
        PASSWORD: 'secret',
        Password: 'secret',
        PaSsWoRd: 'secret',
        API_KEY: 'key',
        ApiKey: 'key'
      };
      
      const sanitized = logger.sanitizeContext(context);
      expect(sanitized.PASSWORD).toBe('[REDACTED]');
      expect(sanitized.Password).toBe('[REDACTED]');
      expect(sanitized.PaSsWoRd).toBe('[REDACTED]');
      expect(sanitized.API_KEY).toBe('[REDACTED]');
      expect(sanitized.ApiKey).toBe('[REDACTED]');
    });

    it('should handle fields containing sensitive keywords', () => {
      const context = {
        user_password_hash: 'hash123',
        password_reset_token: 'reset123',
        encryption_key: 'key123',
        auth_credential: 'cred123',
        non_secret_field: 'secret123',  // This will be redacted since it contains 'secret'
        safe_field: 'visible'
      };
      
      const sanitized = logger.sanitizeContext(context);
      expect(sanitized.user_password_hash).toBe('[REDACTED]');
      expect(sanitized.password_reset_token).toBe('[REDACTED]');
      expect(sanitized.encryption_key).toBe('[REDACTED]');
      expect(sanitized.auth_credential).toBe('[REDACTED]');
      expect(sanitized.non_secret_field).toBe('[REDACTED]'); // Contains 'secret' so should be redacted
      expect(sanitized.safe_field).toBe('visible');
    });

    it('should handle circular references without crashing', () => {
      const context = {
        name: 'test',
        password: 'secret'
      };
      context.circular = context; // Create circular reference
      
      // This should not throw an error
      expect(() => {
        logger.sanitizeContext(context);
      }).not.toThrow();
    });

    it('should preserve non-sensitive data types', () => {
      const context = {
        number: 42,
        boolean: true,
        string: 'hello',
        date: new Date('2024-01-01'),
        regex: /test/,
        func: () => {},
        password: 'secret'
      };
      
      const sanitized = logger.sanitizeContext(context);
      expect(sanitized.number).toBe(42);
      expect(sanitized.boolean).toBe(true);
      expect(sanitized.string).toBe('hello');
      expect(sanitized.date).toEqual(context.date);
      expect(sanitized.regex).toEqual(context.regex);
      expect(sanitized.func).toBe(context.func);
      expect(sanitized.password).toBe('[REDACTED]');
    });
  });

  describe('agentAction with sanitization', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should sanitize context in agentAction logs', () => {
      const context = {
        action: 'login',
        username: 'john',
        password: 'secret123',
        api_key: 'key123'
      };
      
      logger.agentAction('auth', 'Processing login', context);
      
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      const contextLog = consoleSpy.mock.calls[1][0];
      
      expect(contextLog).toContain('username');
      expect(contextLog).toContain('john');
      expect(contextLog).toContain('[REDACTED]');
      expect(contextLog).not.toContain('secret123');
      expect(contextLog).not.toContain('key123');
    });
  });
});